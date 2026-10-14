// Tests de registrarAjuste (RF-017) y de su convivencia con el descuento por
// pedido (RF-019): atomicidad frente a concurrencia, contrato de errores
// (status/codigo/detalles vía errorHandler real) y límites Int32.
// Requieren base MySQL migrada + seed (ver tests/helpers/entorno.js).
//
// Uso: DATABASE_URL=mysql://... npm test
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { prisma, crearUsuario, crearVariante, limpiar } = require("./helpers/entorno");
const inventarioService = require("../src/services/inventario.service");
const inventarioRepository = require("../src/repositories/inventario.repository");
const errorHandler = require("../src/middlewares/errorHandler");
const { crearAjusteSchema } = require("../src/dtos/inventario.dto");

const {
  registrarAjuste,
  descontarPorPedido,
  StockInsuficienteError,
  VarianteNoEncontradaError,
  DescuentoInvalidoError,
} = inventarioService;

const INT32_MAX = 2147483647;

async function stockDe(varianteId) {
  return (await inventarioRepository.obtenerStock(varianteId)).stock;
}

function movimientosDe(varianteId) {
  return prisma.inventarioMovimiento.findMany({ where: { varianteId }, orderBy: { id: "asc" } });
}

// Respuesta mínima de Express para ejercitar errorHandler sin levantar el app.
function pasarPorErrorHandler(error) {
  const res = {
    statusCode: null,
    body: null,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(cuerpo) {
      this.body = cuerpo;
      return this;
    },
  };
  errorHandler(error, {}, res, () => {});
  return res;
}

describe("registrarAjuste (RF-017)", () => {
  let usuarioId;

  before(async () => {
    usuarioId = (await crearUsuario("cliente")).id;
  });

  after(async () => {
    await limpiar();
  });

  describe("contrato externo (no debe cambiar)", () => {
    it("ENTRADA suma, devuelve { movimiento, variante } con el stock actualizado", async () => {
      const v = await crearVariante({ stock: 5 });

      const r = await registrarAjuste(v.id, 3, "ENTRADA", "Reposición", usuarioId);

      assert.deepEqual(Object.keys(r).sort(), ["movimiento", "variante"]);
      assert.equal(r.variante.id, v.id);
      assert.equal(r.variante.stock, 8);
      assert.equal(r.variante.sku, v.sku);
      assert.equal(r.movimiento.varianteId, v.id);
      assert.equal(r.movimiento.cantidad, 3);
      assert.equal(r.movimiento.tipoAjuste, "ENTRADA");
      assert.equal(r.movimiento.motivo, "Reposición");
      assert.equal(r.movimiento.usuarioId, usuarioId);
      assert.equal(await stockDe(v.id), 8);
    });

    it("SALIDA resta; motivo ausente se guarda como null", async () => {
      const v = await crearVariante({ stock: 5 });

      const r = await registrarAjuste(v.id, -2, "SALIDA", undefined, usuarioId);

      assert.equal(r.variante.stock, 3);
      assert.equal(r.movimiento.motivo, null);
    });

    it("dejar el stock exactamente en 0 es válido", async () => {
      const v = await crearVariante({ stock: 4 });

      const r = await registrarAjuste(v.id, -4, "SALIDA", null, usuarioId);

      assert.equal(r.variante.stock, 0);
    });

    it("dejar el stock en negativo -> StockInsuficienteError, sin cambios ni movimiento", async () => {
      const v = await crearVariante({ stock: 4 });

      await assert.rejects(registrarAjuste(v.id, -5, "SALIDA", null, usuarioId), (error) => {
        assert.ok(error instanceof StockInsuficienteError);
        assert.equal(error.message, "El ajuste dejaría el stock en negativo");
        return true;
      });

      assert.equal(await stockDe(v.id), 4);
      assert.equal((await movimientosDe(v.id)).length, 0);
    });

    it("variante inexistente -> VarianteNoEncontradaError con el mensaje de siempre", async () => {
      await assert.rejects(registrarAjuste(2147483000, 1, "ENTRADA", null, usuarioId), (error) => {
        assert.ok(error instanceof VarianteNoEncontradaError);
        assert.equal(error.message, "La variante no existe");
        return true;
      });
    });
  });

  describe("concurrencia con el descuento por pedido", () => {
    it("el stock final es exactamente inicial + deltas exitosos, nunca negativo, y hay un movimiento por operación exitosa", async () => {
      for (let ronda = 1; ronda <= 3; ronda++) {
        const inicial = 10;
        const v = await crearVariante({ stock: inicial });

        // Mezcla deliberada sobre la MISMA variante: salidas manuales, entradas
        // y descuentos por pedido, todo disparado a la vez.
        const operaciones = [
          ...Array.from({ length: 8 }, () => ({
            delta: -2,
            ejecutar: () => registrarAjuste(v.id, -2, "SALIDA", null, usuarioId),
          })),
          ...Array.from({ length: 4 }, () => ({
            delta: 3,
            ejecutar: () => registrarAjuste(v.id, 3, "ENTRADA", null, usuarioId),
          })),
          ...Array.from({ length: 8 }, () => ({
            delta: -1,
            ejecutar: () => descontarPorPedido([{ varianteId: v.id, cantidad: 1 }], { usuarioId }),
          })),
        ];

        const resultados = await Promise.allSettled(operaciones.map((op) => op.ejecutar()));

        // Lo único admisible como rechazo es quedarse sin stock: nada de
        // deadlocks ni errores genéricos de la base.
        const inesperados = resultados
          .filter((r) => r.status === "rejected" && !(r.reason instanceof StockInsuficienteError))
          .map((r) => String(r.reason));
        assert.deepEqual(inesperados, [], `ronda ${ronda}`);

        const exitosas = operaciones.filter((_, i) => resultados[i].status === "fulfilled");
        const sumaDeltas = exitosas.reduce((suma, op) => suma + op.delta, 0);
        const stockFinal = await stockDe(v.id);

        assert.ok(stockFinal >= 0, `ronda ${ronda}: stock negativo (${stockFinal})`);
        assert.equal(stockFinal, inicial + sumaDeltas, `ronda ${ronda}: se perdió una actualización`);

        const movimientos = await movimientosDe(v.id);
        assert.equal(movimientos.length, exitosas.length, `ronda ${ronda}`);
        assert.equal(
          movimientos.reduce((suma, m) => suma + m.cantidad, 0),
          sumaDeltas,
          `ronda ${ronda}`
        );
      }
    });
  });

  describe("errores de inventario formateados por errorHandler (DDS §5.3)", () => {
    it("StockInsuficienteError de registrarAjuste -> 409 STOCK_INSUFICIENTE con detalles", async () => {
      const v = await crearVariante({ stock: 2 });
      const error = await registrarAjuste(v.id, -5, "SALIDA", null, usuarioId).catch((e) => e);

      const res = pasarPorErrorHandler(error);

      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error.codigo, "STOCK_INSUFICIENTE");
      assert.deepEqual(res.body.error.detalles, { varianteId: v.id, disponible: 2 });
    });

    it("StockInsuficienteError de descontarPorPedido -> 409 con varianteId y disponible", async () => {
      const v = await crearVariante({ stock: 3 });
      const error = await descontarPorPedido([{ varianteId: v.id, cantidad: 4 }], {
        usuarioId,
      }).catch((e) => e);

      const res = pasarPorErrorHandler(error);

      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error.codigo, "STOCK_INSUFICIENTE");
      assert.deepEqual(res.body.error.detalles, { varianteId: v.id, disponible: 3 });
      assert.deepEqual(Object.keys(res.body.error).sort(), ["codigo", "detalles", "mensaje"]);
    });

    it("VarianteNoEncontradaError -> 404 VARIANTE_NO_ENCONTRADA (ambas rutas)", async () => {
      const deAjuste = await registrarAjuste(2147483000, 1, "ENTRADA", null, usuarioId).catch(
        (e) => e
      );
      const dePedido = await descontarPorPedido([{ varianteId: 2147483000, cantidad: 1 }], {
        usuarioId,
      }).catch((e) => e);

      for (const error of [deAjuste, dePedido]) {
        const res = pasarPorErrorHandler(error);
        assert.equal(res.statusCode, 404);
        assert.equal(res.body.error.codigo, "VARIANTE_NO_ENCONTRADA");
        assert.equal(res.body.error.detalles, null);
      }
    });

    it("DescuentoInvalidoError -> 400 DESCUENTO_INVALIDO", async () => {
      const error = await descontarPorPedido([], { usuarioId }).catch((e) => e);

      const res = pasarPorErrorHandler(error);

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.error.codigo, "DESCUENTO_INVALIDO");
    });
  });

  describe("límites Int32", () => {
    it("descontarPorPedido: varianteId fuera de Int32 -> DescuentoInvalidoError", async () => {
      await assert.rejects(
        descontarPorPedido([{ varianteId: INT32_MAX + 1, cantidad: 1 }], { usuarioId }),
        DescuentoInvalidoError
      );
    });

    it("descontarPorPedido: cantidad fuera de Int32 -> DescuentoInvalidoError", async () => {
      const v = await crearVariante({ stock: 5 });

      await assert.rejects(
        descontarPorPedido([{ varianteId: v.id, cantidad: INT32_MAX + 1 }], { usuarioId }),
        DescuentoInvalidoError
      );
      assert.equal(await stockDe(v.id), 5);
    });

    it("descontarPorPedido: la suma de líneas duplicadas también se acota a Int32", async () => {
      const v = await crearVariante({ stock: 5 });

      await assert.rejects(
        descontarPorPedido(
          [
            { varianteId: v.id, cantidad: 1500000000 },
            { varianteId: v.id, cantidad: 1500000000 },
          ],
          { usuarioId }
        ),
        DescuentoInvalidoError
      );
      assert.equal(await stockDe(v.id), 5);
    });

    it("descontarPorPedido: usuarioId / pedidoId fuera de Int32 -> DescuentoInvalidoError", async () => {
      const v = await crearVariante({ stock: 5 });

      await assert.rejects(
        descontarPorPedido([{ varianteId: v.id, cantidad: 1 }], { usuarioId: INT32_MAX + 1 }),
        DescuentoInvalidoError
      );
      await assert.rejects(
        descontarPorPedido([{ varianteId: v.id, cantidad: 1 }], {
          usuarioId,
          pedidoId: INT32_MAX + 1,
        }),
        DescuentoInvalidoError
      );
    });

    it("descontarPorPedido: INT32_MAX es un valor válido (la variante simplemente no existe)", async () => {
      await assert.rejects(
        descontarPorPedido([{ varianteId: INT32_MAX, cantidad: 1 }], { usuarioId }),
        VarianteNoEncontradaError
      );
    });

    it("registrarAjuste: varianteId fuera de Int32 -> VarianteNoEncontradaError (404, igual que antes)", async () => {
      await assert.rejects(
        registrarAjuste(INT32_MAX + 1, 1, "ENTRADA", null, usuarioId),
        VarianteNoEncontradaError
      );
    });

    it("registrarAjuste: cantidad fuera de Int32 -> DescuentoInvalidoError, sin tocar el stock", async () => {
      const v = await crearVariante({ stock: 5 });

      await assert.rejects(
        registrarAjuste(v.id, INT32_MAX + 1, "ENTRADA", null, usuarioId),
        DescuentoInvalidoError
      );
      await assert.rejects(
        registrarAjuste(v.id, -(INT32_MAX + 1), "SALIDA", null, usuarioId),
        DescuentoInvalidoError
      );
      assert.equal(await stockDe(v.id), 5);
    });

    it("el DTO del endpoint rechaza varianteId y cantidad fuera de Int32 (400 por el camino de siempre)", () => {
      const base = { varianteId: 1, cantidad: 1, tipoAjuste: "ENTRADA" };

      assert.equal(crearAjusteSchema.safeParse(base).success, true);
      assert.equal(crearAjusteSchema.safeParse({ ...base, varianteId: INT32_MAX + 1 }).success, false);
      assert.equal(crearAjusteSchema.safeParse({ ...base, cantidad: INT32_MAX + 1 }).success, false);
      assert.equal(crearAjusteSchema.safeParse({ ...base, cantidad: -(INT32_MAX + 1) }).success, false);
    });
  });
});
