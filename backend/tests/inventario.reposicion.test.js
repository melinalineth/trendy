// Tests de la reposición atómica de inventario por pedido (Sprint 4: pago
// rechazado devuelve el stock que se descontó al crear el pedido). Es la
// operación simétrica de descontarPorPedido (ver inventario.descuento.test.js):
// mismas validaciones, mismo agrupado/orden de líneas, misma participación en
// una transacción externa.
//
// Uso: DATABASE_URL=mysql://... npm test
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { prisma, crearUsuario, crearVariante, limpiar } = require("./helpers/entorno");
const inventarioService = require("../src/services/inventario.service");
const inventarioRepository = require("../src/repositories/inventario.repository");

const {
  reponerPorPedido,
  descontarPorPedido,
  VarianteNoEncontradaError,
  DescuentoInvalidoError,
} = inventarioService;

const INT32_MAX = 2147483647;

async function stockDe(varianteId) {
  return (await inventarioRepository.obtenerStock(varianteId)).stock;
}

function movimientosDe(varianteId) {
  return prisma.inventarioMovimiento.findMany({
    where: { varianteId },
    orderBy: { id: "asc" },
  });
}

describe("Reposición atómica de inventario por pedido (pago rechazado)", () => {
  let usuarioId;

  before(async () => {
    usuarioId = (await crearUsuario("cliente")).id;
  });

  after(async () => {
    await limpiar();
  });

  it("repone 2 variantes y registra un movimiento ENTRADA (delta positivo) por cada una", async () => {
    const a = await crearVariante({ stock: 1 });
    const b = await crearVariante({ stock: 0 });

    const resultado = await reponerPorPedido(
      [
        { varianteId: a.id, cantidad: 2 },
        { varianteId: b.id, cantidad: 5 },
      ],
      { usuarioId }
    );

    assert.equal(await stockDe(a.id), 3);
    assert.equal(await stockDe(b.id), 5);
    assert.equal(resultado.movimientos.length, 2);

    const [movA] = await movimientosDe(a.id);
    assert.equal(movA.tipoAjuste, "ENTRADA");
    assert.equal(movA.cantidad, 2);
    assert.equal(movA.usuarioId, usuarioId);
    assert.equal((await movimientosDe(b.id))[0].cantidad, 5);
  });

  it("descontar y luego reponer el mismo pedido deja el stock como estaba", async () => {
    const a = await crearVariante({ stock: 4 });
    const items = [{ varianteId: a.id, cantidad: 3 }];

    await descontarPorPedido(items, { usuarioId, pedidoId: 9 });
    assert.equal(await stockDe(a.id), 1);

    await reponerPorPedido(items, { usuarioId, pedidoId: 9 });
    assert.equal(await stockDe(a.id), 4);

    const movimientos = await movimientosDe(a.id);
    assert.deepEqual(
      movimientos.map((m) => [m.tipoAjuste, m.cantidad]),
      [
        ["SALIDA", -3],
        ["ENTRADA", 3],
      ]
    );
  });

  it("suma las líneas duplicadas de la misma variante en una sola reposición", async () => {
    const a = await crearVariante({ stock: 0 });

    await reponerPorPedido(
      [
        { varianteId: a.id, cantidad: 2 },
        { varianteId: a.id, cantidad: 3 },
      ],
      { usuarioId }
    );

    assert.equal(await stockDe(a.id), 5);
    const movimientos = await movimientosDe(a.id);
    assert.equal(movimientos.length, 1);
    assert.equal(movimientos[0].cantidad, 5);
  });

  it("motivo por defecto con referencia al pedido, y motivo propio si se pasa", async () => {
    const a = await crearVariante({ stock: 0 });
    const b = await crearVariante({ stock: 0 });

    await reponerPorPedido([{ varianteId: a.id, cantidad: 1 }], { usuarioId, pedidoId: 77 });
    await reponerPorPedido([{ varianteId: b.id, cantidad: 1 }], {
      usuarioId,
      pedidoId: 78,
      motivo: "Pedido rechazado",
    });

    assert.equal((await movimientosDe(a.id))[0].motivo, "Reposición de pedido (pedido #77)");
    assert.equal((await movimientosDe(b.id))[0].motivo, "Pedido rechazado (pedido #78)");
  });

  it("una variante inexistente lanza VarianteNoEncontradaError y revierte las demás", async () => {
    const a = await crearVariante({ stock: 5 });

    await assert.rejects(
      reponerPorPedido(
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

  it("si la reposición desbordaría el Int32 de la columna stock -> DescuentoInvalidoError, sin tocar nada", async () => {
    const a = await crearVariante({ stock: INT32_MAX - 1 });
    const b = await crearVariante({ stock: 0 });

    await assert.rejects(
      reponerPorPedido(
        [
          { varianteId: b.id, cantidad: 1 },
          { varianteId: a.id, cantidad: 2 },
        ],
        { usuarioId }
      ),
      DescuentoInvalidoError
    );

    assert.equal(await stockDe(a.id), INT32_MAX - 1);
    assert.equal(await stockDe(b.id), 0);
    assert.equal((await movimientosDe(b.id)).length, 0);
  });

  describe("entradas inválidas -> DescuentoInvalidoError (400), sin tocar la base", () => {
    const casos = [
      ["items vacío", () => []],
      ["items no es un array", () => ({ varianteId: 1, cantidad: 1 })],
      ["línea null", () => [null]],
      ["cantidad 0", (v) => [{ varianteId: v.id, cantidad: 0 }]],
      // Una cantidad negativa en una REPOSICIÓN terminaría DESCONTANDO stock
      // sin la guarda de stock >= cantidad: se rechaza igual que en el
      // descuento.
      ["cantidad negativa", (v) => [{ varianteId: v.id, cantidad: -1 }]],
      ["cantidad decimal", (v) => [{ varianteId: v.id, cantidad: 1.5 }]],
      ["cantidad string", (v) => [{ varianteId: v.id, cantidad: "1" }]],
      ["varianteId 0", () => [{ varianteId: 0, cantidad: 1 }]],
    ];

    for (const [nombre, armarItems] of casos) {
      it(nombre, async () => {
        const a = await crearVariante({ stock: 5 });

        await assert.rejects(
          reponerPorPedido(armarItems(a), { usuarioId }),
          DescuentoInvalidoError
        );

        assert.equal(await stockDe(a.id), 5);
        assert.equal((await movimientosDe(a.id)).length, 0);
      });
    }

    it("sin usuarioId o con pedidoId inválido -> DescuentoInvalidoError", async () => {
      const a = await crearVariante({ stock: 5 });
      const items = [{ varianteId: a.id, cantidad: 1 }];

      await assert.rejects(reponerPorPedido(items), DescuentoInvalidoError);
      await assert.rejects(reponerPorPedido(items, { usuarioId: 0 }), DescuentoInvalidoError);
      await assert.rejects(
        reponerPorPedido(items, { usuarioId, pedidoId: -3 }),
        DescuentoInvalidoError
      );

      assert.equal(await stockDe(a.id), 5);
    });

    it("el error trae status 400 y codigo para que errorHandler lo formatee", async () => {
      await assert.rejects(reponerPorPedido([], { usuarioId }), (error) => {
        assert.equal(error.status, 400);
        assert.equal(error.codigo, "DESCUENTO_INVALIDO");
        return true;
      });
    });
  });

  describe("concurrencia", () => {
    it("10 reposiciones simultáneas de 1 unidad: stock +10 y 10 movimientos (sin lost update)", async () => {
      const a = await crearVariante({ stock: 0 });

      const resultados = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          reponerPorPedido([{ varianteId: a.id, cantidad: 1 }], { usuarioId })
        )
      );

      assert.deepEqual(
        resultados.filter((r) => r.status === "rejected").map((r) => String(r.reason)),
        []
      );
      assert.equal(await stockDe(a.id), 10);
      assert.equal((await movimientosDe(a.id)).length, 10);
    });

    it("reposiciones y descuentos simultáneos con líneas en orden opuesto: sin deadlock y stock exacto", async () => {
      const a = await crearVariante({ stock: 10 });
      const b = await crearVariante({ stock: 10 });

      const resultados = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) => {
          const lineas =
            i % 2 === 0
              ? [
                  { varianteId: a.id, cantidad: 1 },
                  { varianteId: b.id, cantidad: 2 },
                ]
              : [
                  { varianteId: b.id, cantidad: 2 },
                  { varianteId: a.id, cantidad: 1 },
                ];

          return i % 4 < 2
            ? reponerPorPedido(lineas, { usuarioId })
            : descontarPorPedido(lineas, { usuarioId });
        })
      );

      assert.deepEqual(
        resultados.filter((r) => r.status === "rejected").map((r) => String(r.reason)),
        []
      );
      // 4 reposiciones y 4 descuentos de (a x1 + b x2): se compensan.
      assert.equal(await stockDe(a.id), 10);
      assert.equal(await stockDe(b.id), 10);
    });
  });

  describe("integración con una transacción externa (webhook de pago rechazado)", () => {
    it("con { tx } participa de la transacción del llamador: si ésta revierte, la reposición también", async () => {
      const a = await crearVariante({ stock: 2 });

      await assert.rejects(
        prisma.$transaction(async (tx) => {
          await reponerPorPedido([{ varianteId: a.id, cantidad: 3 }], { usuarioId, tx });
          assert.equal((await tx.variante.findUnique({ where: { id: a.id } })).stock, 5);
          throw new Error("falla posterior en la transacción del pago");
        }),
        /falla posterior/
      );

      assert.equal(await stockDe(a.id), 2);
      assert.equal((await movimientosDe(a.id)).length, 0);
    });

    it("con { tx } y commit, la reposición queda confirmada", async () => {
      const a = await crearVariante({ stock: 2 });

      await prisma.$transaction((tx) =>
        reponerPorPedido([{ varianteId: a.id, cantidad: 3 }], { usuarioId, tx })
      );

      assert.equal(await stockDe(a.id), 5);
    });
  });
});
