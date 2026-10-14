// Tests del descuento atómico de inventario por pedido (RF-019, cierre de
// MOD-03; RN-002: el stock nunca queda negativo). No hay endpoint HTTP: se
// prueba la función de service/repository contra una base MySQL real (ver
// tests/helpers/entorno.js — migrada + seed, nombre con "test"/"scratch").
//
// Uso: DATABASE_URL=mysql://... npm test
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { prisma, crearUsuario, crearVariante, limpiar } = require("./helpers/entorno");
const inventarioService = require("../src/services/inventario.service");
const inventarioRepository = require("../src/repositories/inventario.repository");

const {
  descontarPorPedido,
  StockInsuficienteError,
  VarianteNoEncontradaError,
  DescuentoInvalidoError,
} = inventarioService;

async function stockDe(varianteId) {
  return (await inventarioRepository.obtenerStock(varianteId)).stock;
}

function movimientosDe(varianteId) {
  return prisma.inventarioMovimiento.findMany({
    where: { varianteId },
    orderBy: { id: "asc" },
  });
}

describe("Descuento atómico de inventario por pedido (RF-019)", () => {
  let usuarioId;

  before(async () => {
    usuarioId = (await crearUsuario("cliente")).id;
  });

  after(async () => {
    await limpiar();
  });

  it("descuenta 3 variantes y registra un movimiento SALIDA por cada una", async () => {
    const a = await crearVariante({ stock: 10 });
    const b = await crearVariante({ stock: 4 });
    const c = await crearVariante({ stock: 7 });

    const resultado = await descontarPorPedido(
      [
        { varianteId: a.id, cantidad: 2 },
        { varianteId: b.id, cantidad: 4 },
        { varianteId: c.id, cantidad: 1 },
      ],
      { usuarioId }
    );

    assert.equal(await stockDe(a.id), 8);
    assert.equal(await stockDe(b.id), 0);
    assert.equal(await stockDe(c.id), 6);
    assert.equal(resultado.movimientos.length, 3);

    const [movA] = await movimientosDe(a.id);
    assert.equal(movA.tipoAjuste, "SALIDA");
    // El movimiento guarda el delta firmado, igual que registrarAjuste.
    assert.equal(movA.cantidad, -2);
    assert.equal(movA.motivo, "Pedido confirmado");
    assert.equal(movA.usuarioId, usuarioId);
    assert.equal((await movimientosDe(b.id))[0].cantidad, -4);
    assert.equal((await movimientosDe(c.id))[0].cantidad, -1);
  });

  it("si UNA variante no tiene stock, se revierte TODO (nada a medias ni movimientos huérfanos)", async () => {
    const a = await crearVariante({ stock: 10 });
    const b = await crearVariante({ stock: 3 });
    const c = await crearVariante({ stock: 10 });

    await assert.rejects(
      descontarPorPedido(
        [
          { varianteId: a.id, cantidad: 2 },
          { varianteId: b.id, cantidad: 999999 },
          { varianteId: c.id, cantidad: 2 },
        ],
        { usuarioId }
      ),
      (error) => {
        assert.ok(error instanceof StockInsuficienteError);
        assert.equal(error.varianteId, b.id);
        return true;
      }
    );

    assert.equal(await stockDe(a.id), 10);
    assert.equal(await stockDe(b.id), 3);
    assert.equal(await stockDe(c.id), 10);
    for (const v of [a, b, c]) {
      assert.equal((await movimientosDe(v.id)).length, 0, "no deben quedar movimientos huérfanos");
    }
  });

  it("la variante que falla puede estar primera: las demás tampoco quedan descontadas", async () => {
    const sinStock = await crearVariante({ stock: 0 });
    const a = await crearVariante({ stock: 5 });

    await assert.rejects(
      descontarPorPedido(
        [
          { varianteId: a.id, cantidad: 1 },
          { varianteId: sinStock.id, cantidad: 1 },
        ],
        { usuarioId }
      ),
      StockInsuficienteError
    );

    assert.equal(await stockDe(a.id), 5);
    assert.equal((await movimientosDe(a.id)).length, 0);
  });

  it("suma las líneas duplicadas de la misma variante en un solo descuento", async () => {
    const a = await crearVariante({ stock: 10 });

    await descontarPorPedido(
      [
        { varianteId: a.id, cantidad: 2 },
        { varianteId: a.id, cantidad: 3 },
      ],
      { usuarioId }
    );

    assert.equal(await stockDe(a.id), 5);
    const movimientos = await movimientosDe(a.id);
    assert.equal(movimientos.length, 1);
    assert.equal(movimientos[0].cantidad, -5);
  });

  it("las líneas duplicadas se validan SUMADAS contra el stock (2 + 3 > 4 falla)", async () => {
    const a = await crearVariante({ stock: 4 });

    await assert.rejects(
      descontarPorPedido(
        [
          { varianteId: a.id, cantidad: 2 },
          { varianteId: a.id, cantidad: 3 },
        ],
        { usuarioId }
      ),
      StockInsuficienteError
    );

    assert.equal(await stockDe(a.id), 4);
  });

  it("pedir exactamente el stock disponible es válido y deja 0", async () => {
    const a = await crearVariante({ stock: 3 });

    await descontarPorPedido([{ varianteId: a.id, cantidad: 3 }], { usuarioId });

    assert.equal(await stockDe(a.id), 0);
  });

  it("pedir el stock disponible + 1 falla y no toca el stock", async () => {
    const a = await crearVariante({ stock: 3 });

    await assert.rejects(
      descontarPorPedido([{ varianteId: a.id, cantidad: 4 }], { usuarioId }),
      StockInsuficienteError
    );

    assert.equal(await stockDe(a.id), 3);
    assert.equal((await movimientosDe(a.id)).length, 0);
  });

  it("una variante inexistente lanza VarianteNoEncontradaError y revierte las demás", async () => {
    const a = await crearVariante({ stock: 5 });

    await assert.rejects(
      descontarPorPedido(
        [
          { varianteId: a.id, cantidad: 1 },
          { varianteId: 2147483000, cantidad: 1 },
        ],
        { usuarioId }
      ),
      VarianteNoEncontradaError
    );

    assert.equal(await stockDe(a.id), 5);
    assert.equal((await movimientosDe(a.id)).length, 0);
  });

  describe("entradas inválidas -> DescuentoInvalidoError (400), sin tocar la base", () => {
    const casos = [
      ["items vacío", () => []],
      ["items undefined", () => undefined],
      ["items null", () => null],
      ["items no es un array", () => ({ varianteId: 1, cantidad: 1 })],
      ["línea null", () => [null]],
      ["cantidad 0", (v) => [{ varianteId: v.id, cantidad: 0 }]],
      ["cantidad negativa", (v) => [{ varianteId: v.id, cantidad: -1 }]],
      ["cantidad decimal", (v) => [{ varianteId: v.id, cantidad: 1.5 }]],
      ["cantidad string", (v) => [{ varianteId: v.id, cantidad: "1" }]],
      ["cantidad NaN", (v) => [{ varianteId: v.id, cantidad: NaN }]],
      ["cantidad ausente", (v) => [{ varianteId: v.id }]],
      ["varianteId ausente", () => [{ cantidad: 1 }]],
      ["varianteId 0", () => [{ varianteId: 0, cantidad: 1 }]],
      ["varianteId string", (v) => [{ varianteId: String(v.id), cantidad: 1 }]],
      ["varianteId decimal", () => [{ varianteId: 1.5, cantidad: 1 }]],
    ];

    for (const [nombre, armarItems] of casos) {
      it(nombre, async () => {
        const a = await crearVariante({ stock: 5 });

        await assert.rejects(
          descontarPorPedido(armarItems(a), { usuarioId }),
          DescuentoInvalidoError
        );

        assert.equal(await stockDe(a.id), 5);
        assert.equal((await movimientosDe(a.id)).length, 0);
      });
    }

    it("una línea inválida junto a una válida no descuenta la válida", async () => {
      const a = await crearVariante({ stock: 5 });

      await assert.rejects(
        descontarPorPedido(
          [
            { varianteId: a.id, cantidad: 1 },
            { varianteId: a.id, cantidad: -1 },
          ],
          { usuarioId }
        ),
        DescuentoInvalidoError
      );

      assert.equal(await stockDe(a.id), 5);
    });

    it("sin usuarioId (los movimientos exigen usuario) -> DescuentoInvalidoError", async () => {
      const a = await crearVariante({ stock: 5 });

      await assert.rejects(
        descontarPorPedido([{ varianteId: a.id, cantidad: 1 }]),
        DescuentoInvalidoError
      );
      await assert.rejects(
        descontarPorPedido([{ varianteId: a.id, cantidad: 1 }], { usuarioId: 0 }),
        DescuentoInvalidoError
      );

      assert.equal(await stockDe(a.id), 5);
    });

    it("el error trae status 400 y codigo para que errorHandler lo formatee", async () => {
      await assert.rejects(descontarPorPedido([], { usuarioId }), (error) => {
        assert.equal(error.status, 400);
        assert.equal(error.codigo, "DESCUENTO_INVALIDO");
        return true;
      });
    });
  });

  describe("concurrencia", () => {
    it("10 pedidos simultáneos de 1 unidad sobre stock 5: exactamente 5 ok, 5 rechazados, stock final 0", async () => {
      const a = await crearVariante({ stock: 5 });

      const resultados = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          descontarPorPedido([{ varianteId: a.id, cantidad: 1 }], { usuarioId })
        )
      );

      const ok = resultados.filter((r) => r.status === "fulfilled");
      const rechazados = resultados.filter((r) => r.status === "rejected");

      assert.equal(ok.length, 5);
      assert.equal(rechazados.length, 5);
      for (const r of rechazados) {
        assert.ok(r.reason instanceof StockInsuficienteError, String(r.reason));
      }
      assert.equal(await stockDe(a.id), 0);

      const movimientos = await movimientosDe(a.id);
      assert.equal(movimientos.length, 5);
      assert.equal(
        movimientos.reduce((suma, m) => suma + m.cantidad, 0),
        -5
      );
    });

    it("pedidos simultáneos con las líneas en orden opuesto no se traban (sin deadlock) y descuentan bien", async () => {
      const a = await crearVariante({ stock: 10 });
      const b = await crearVariante({ stock: 10 });

      const resultados = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) =>
          descontarPorPedido(
            i % 2 === 0
              ? [
                  { varianteId: a.id, cantidad: 1 },
                  { varianteId: b.id, cantidad: 1 },
                ]
              : [
                  { varianteId: b.id, cantidad: 1 },
                  { varianteId: a.id, cantidad: 1 },
                ],
            { usuarioId }
          )
        )
      );

      assert.deepEqual(
        resultados.filter((r) => r.status === "rejected").map((r) => String(r.reason)),
        []
      );
      assert.equal(await stockDe(a.id), 2);
      assert.equal(await stockDe(b.id), 2);
    });

    it("pedidos multi-variante competidores: nunca queda stock negativo ni descuento a medias", async () => {
      // Stock para 3 pedidos completos de (a x1 + b x1) pero 'b' alcanza solo
      // para 3: de 6 pedidos simultáneos deben pasar exactamente 3.
      const a = await crearVariante({ stock: 10 });
      const b = await crearVariante({ stock: 3 });

      const resultados = await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          descontarPorPedido(
            [
              { varianteId: a.id, cantidad: 1 },
              { varianteId: b.id, cantidad: 1 },
            ],
            { usuarioId }
          )
        )
      );

      assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 3);
      assert.equal(await stockDe(b.id), 0);
      // 'a' solo se descontó en los 3 pedidos que prosperaron: el rollback de
      // los rechazados devolvió lo suyo.
      assert.equal(await stockDe(a.id), 7);
    });
  });

  describe("integración con una transacción externa (Sprint 4: crear pedido + descontar)", () => {
    it("con { tx } participa de la transacción del llamador: si ésta revierte, el descuento también", async () => {
      const a = await crearVariante({ stock: 5 });

      await assert.rejects(
        prisma.$transaction(async (tx) => {
          await descontarPorPedido([{ varianteId: a.id, cantidad: 2 }], { usuarioId, tx });
          assert.equal((await tx.variante.findUnique({ where: { id: a.id } })).stock, 3);
          throw new Error("falla posterior en la transacción del pedido");
        }),
        /falla posterior/
      );

      assert.equal(await stockDe(a.id), 5);
      assert.equal((await movimientosDe(a.id)).length, 0);
    });

    it("con { tx } y commit, el descuento queda confirmado", async () => {
      const a = await crearVariante({ stock: 5 });

      await prisma.$transaction((tx) =>
        descontarPorPedido([{ varianteId: a.id, cantidad: 2 }], { usuarioId, tx })
      );

      assert.equal(await stockDe(a.id), 3);
    });

    it("con { pedidoId } deja la referencia al pedido en el motivo del movimiento", async () => {
      const a = await crearVariante({ stock: 5 });

      await descontarPorPedido([{ varianteId: a.id, cantidad: 1 }], { usuarioId, pedidoId: 77 });

      const [mov] = await movimientosDe(a.id);
      assert.equal(mov.motivo, "Pedido confirmado (pedido #77)");
    });
  });

  describe("obtenerStock", () => {
    it("devuelve { stock } de la variante y null si no existe", async () => {
      const a = await crearVariante({ stock: 9 });

      assert.deepEqual(await inventarioRepository.obtenerStock(a.id), { stock: 9 });
      assert.equal(await inventarioRepository.obtenerStock(2147483000), null);
    });
  });
});
