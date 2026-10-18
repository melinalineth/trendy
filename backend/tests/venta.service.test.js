// Service de ventas (Sprint 5, RF-041; RN-008, RN-009): registro idempotente de
// la venta de un pedido confirmado y anulación. Llama directo al service contra
// una base real (no levanta el servidor); la integración con el webhook y con
// PATCH /estado está en venta.registro.http.test.js.
//
// Uso: DATABASE_URL=mysql://... npm test (base descartable: ver entorno.js).
const { describe, it, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");

const {
  prisma,
  crearUsuario,
  crearVariante,
  crearDireccion,
  crearPedido,
  limpiar,
} = require("./helpers/entorno");
const ventaService = require("../src/services/venta.service");
const ventaRepository = require("../src/repositories/venta.repository");

const ID_INEXISTENTE = 2147483000;

describe("Service de ventas (RF-041)", () => {
  let cliente;
  let admin;
  let vendedor;
  let variante;
  let direccion;

  // Pedido real (2 x 12345.00 + 8000 de envío = 32690.00).
  const pedidoDe = (opciones = {}) =>
    crearPedido({
      usuarioId: cliente.id,
      direccionId: direccion.id,
      lineas: [{ variante, cantidad: 2, precioUnitario: "12345.00" }],
      costoEnvio: 8000,
      estado: "CONFIRMADO",
      ...opciones,
    });

  const ventasDe = (pedidoId) => prisma.venta.count({ where: { pedidoId } });

  before(async () => {
    cliente = await crearUsuario("cliente");
    admin = await crearUsuario("admin");
    vendedor = await crearUsuario("vendedor");
    variante = await crearVariante({ precio: "12345.00", stock: 100 });
    direccion = await crearDireccion(cliente.id);
  });

  after(async () => {
    mock.restoreAll();
    await limpiar();
  });

  describe("contrato del módulo", () => {
    it("ESTADOS_QUE_CUENTAN son los estados de un pedido confirmado y no cancelado", () => {
      assert.deepEqual(ventaService.ESTADOS_QUE_CUENTAN, [
        "CONFIRMADO",
        "EN_PREPARACION",
        "ENVIADO",
        "EN_TRANSITO",
        "ENTREGADO",
      ]);
      assert.ok(Object.isFrozen(ventaService.ESTADOS_QUE_CUENTAN));
    });

    it("no exporta funciones para modificar o borrar ventas (solo registrar y anular)", () => {
      const funciones = Object.entries(ventaService)
        .filter(([, valor]) => typeof valor === "function" && !/Error$/.test(valor.name))
        .map(([nombre]) => nombre)
        .sort();

      assert.deepEqual(funciones, ["anularVentaDePedido", "registrarVentaDePedido"]);
    });
  });

  describe("registrarVentaDePedido", () => {
    it("pedido inexistente -> 404 PEDIDO_NO_ENCONTRADO", async () => {
      await assert.rejects(ventaService.registrarVentaDePedido(ID_INEXISTENTE), (error) => {
        assert.equal(error.status, 404);
        assert.equal(error.codigo, "PEDIDO_NO_ENCONTRADO");
        return true;
      });
    });

    for (const estado of [
      "PENDIENTE",
      "PAGO_PENDIENTE",
      "PAGO_RECHAZADO",
      "PAGO_APROBADO",
      "CANCELADO",
    ]) {
      it(`pedido ${estado} -> 409 PEDIDO_NO_CONFIRMADO y no queda ninguna venta`, async () => {
        const pedido = await pedidoDe({ estado });

        await assert.rejects(ventaService.registrarVentaDePedido(pedido.id), (error) => {
          assert.equal(error.status, 409);
          assert.equal(error.codigo, "PEDIDO_NO_CONFIRMADO");
          assert.deepEqual(error.detalles, { estado });
          return true;
        });
        assert.equal(await ventasDe(pedido.id), 0);
      });
    }

    for (const estado of ventaService.ESTADOS_QUE_CUENTAN) {
      it(`pedido ${estado} -> crea la venta REGISTRADA`, async () => {
        const pedido = await pedidoDe({ estado, metodoPago: "CONTRA_ENTREGA" });

        const { venta, creada } = await ventaService.registrarVentaDePedido(pedido.id, {
          responsableId: admin.id,
        });

        assert.equal(creada, true);
        assert.equal(venta.pedidoId, pedido.id);
        assert.equal(venta.estado, "REGISTRADA");
        assert.equal(await ventasDe(pedido.id), 1);
      });
    }

    it("copia cliente, método y montos del pedido (centavos incluidos) y guarda al responsable", async () => {
      const pedido = await pedidoDe({
        metodoPago: "CONTRA_ENTREGA",
        lineas: [{ variante, cantidad: 3, precioUnitario: "19990.55" }],
        costoEnvio: 0.35,
      });

      const { venta } = await ventaService.registrarVentaDePedido(pedido.id, {
        responsableId: vendedor.id,
      });

      assert.equal(venta.clienteId, cliente.id);
      assert.equal(venta.responsableId, vendedor.id);
      assert.equal(venta.metodoPago, "CONTRA_ENTREGA");
      // 3 x 19990.55 = 59971.65 ; + 0.35 = 59972.00
      assert.equal(venta.subtotal.toFixed(2), "59971.65");
      assert.equal(venta.costoEnvio.toFixed(2), "0.35");
      assert.equal(venta.total.toFixed(2), "59972.00");
    });

    it("sin responsable (webhook de Mercado Pago) queda NULL", async () => {
      const pedido = await pedidoDe({ metodoPago: "MERCADO_PAGO" });

      const { venta } = await ventaService.registrarVentaDePedido(pedido.id);

      assert.equal(venta.responsableId, null);
      assert.equal(venta.metodoPago, "MERCADO_PAGO");
    });

    it("es idempotente: la segunda llamada devuelve la MISMA venta (creada: false), no escribe y no pisa al responsable", async () => {
      const pedido = await pedidoDe();
      const primera = await ventaService.registrarVentaDePedido(pedido.id, {
        responsableId: admin.id,
      });

      const segunda = await ventaService.registrarVentaDePedido(pedido.id, {
        responsableId: vendedor.id,
      });

      assert.equal(primera.creada, true);
      assert.equal(segunda.creada, false);
      assert.equal(segunda.venta.id, primera.venta.id);
      assert.equal(segunda.venta.responsableId, admin.id);
      assert.equal(await ventasDe(pedido.id), 1);
    });

    it("RN-008: los montos salen del PEDIDO, no del precio vigente del producto", async () => {
      const producto = await crearVariante({ precio: "10000.00", stock: 10 });
      const pedido = await crearPedido({
        usuarioId: cliente.id,
        direccionId: direccion.id,
        lineas: [{ variante: producto, cantidad: 2, precioUnitario: "10000.00" }],
        estado: "CONFIRMADO",
      });
      await prisma.producto.update({
        where: { id: producto.productoId },
        data: { precio: "99999.00" },
      });

      const { venta } = await ventaService.registrarVentaDePedido(pedido.id);

      assert.equal(venta.total.toFixed(2), "20000.00");

      // Y después de registrada tampoco cambia con un nuevo cambio de precio.
      await prisma.producto.update({
        where: { id: producto.productoId },
        data: { precio: "1.00" },
      });
      const releida = await prisma.venta.findUnique({ where: { pedidoId: pedido.id } });
      assert.equal(releida.total.toFixed(2), "20000.00");
      const detalle = await prisma.detallePedido.findFirst({ where: { pedidoId: pedido.id } });
      assert.equal(detalle.precioUnitario.toFixed(2), "10000.00");
    });

    it("lee el pedido bajo el lock: si cambió por fuera después de la foto de la transacción, manda el estado vigente", async () => {
      const pedido = await pedidoDe({ estado: "PENDIENTE" });

      const { venta } = await prisma.$transaction(async (tx) => {
        await tx.pedido.findUnique({ where: { id: pedido.id } }); // foto vieja: PENDIENTE
        await prisma.pedido.update({ where: { id: pedido.id }, data: { estado: "CONFIRMADO" } });

        return ventaService.registrarVentaDePedido(pedido.id, {}, tx);
      });

      assert.equal(venta.pedidoId, pedido.id);
    });

    describe("concurrencia (RN-009)", () => {
      it("6 llamadas SIMULTÁNEAS sin transacción -> una sola fila, ninguna falla y exactamente una la crea", async () => {
        const pedido = await pedidoDe();

        const resultados = await Promise.all(
          Array.from({ length: 6 }, () => ventaService.registrarVentaDePedido(pedido.id))
        );

        assert.equal(await ventasDe(pedido.id), 1);
        assert.equal(resultados.filter((r) => r.creada).length, 1);
        assert.equal(new Set(resultados.map((r) => r.venta.id)).size, 1);
      });

      it("4 transacciones SIMULTÁNEAS, cada una con su tx -> una sola fila y ninguna falla", async () => {
        const pedido = await pedidoDe();

        const resultados = await Promise.all(
          Array.from({ length: 4 }, () =>
            prisma.$transaction((tx) => ventaService.registrarVentaDePedido(pedido.id, {}, tx))
          )
        );

        assert.equal(await ventasDe(pedido.id), 1);
        assert.equal(resultados.filter((r) => r.creada).length, 1);
        assert.equal(new Set(resultados.map((r) => r.venta.id)).size, 1);
      });

      it("P2002 del unique de pedidoId (otro la creó entre la búsqueda y el alta): relee y devuelve la existente", async () => {
        const pedido = await pedidoDe();
        const existente = await ventaRepository.crear({
          pedidoId: pedido.id,
          clienteId: cliente.id,
          subtotal: pedido.subtotal,
          costoEnvio: pedido.costoEnvio,
          total: pedido.total,
          metodoPago: pedido.metodoPago,
        });
        // La primera búsqueda "no la ve" (carrera): el alta choca con el unique.
        const original = ventaRepository.buscarPorPedido;
        let llamadas = 0;
        const espia = mock.method(ventaRepository, "buscarPorPedido", (...args) => {
          llamadas += 1;
          return llamadas === 1 ? Promise.resolve(null) : original(...args);
        });

        try {
          const { venta, creada } = await ventaService.registrarVentaDePedido(pedido.id);

          assert.equal(creada, false);
          assert.equal(venta.id, existente.id);
          assert.equal(llamadas, 2);
        } finally {
          espia.mock.restore();
        }
        assert.equal(await ventasDe(pedido.id), 1);
      });

      it("P2002 dentro de una transacción con foto vieja: la relectura es con lock y ve la venta confirmada por otro", async () => {
        const pedido = await pedidoDe();

        const { venta, creada } = await prisma.$transaction(async (tx) => {
          await tx.venta.findUnique({ where: { pedidoId: pedido.id } }); // foto: sin venta
          await ventaRepository.crear({
            pedidoId: pedido.id,
            clienteId: cliente.id,
            subtotal: pedido.subtotal,
            costoEnvio: pedido.costoEnvio,
            total: pedido.total,
            metodoPago: pedido.metodoPago,
          }); // otro actor, ya confirmada

          return ventaService.registrarVentaDePedido(pedido.id, {}, tx);
        });

        assert.equal(creada, false);
        assert.equal(venta.pedidoId, pedido.id);
        assert.equal(await ventasDe(pedido.id), 1);
      });

      it("un P2002 de OTRO índice no se confunde con la carrera: se propaga", async () => {
        const pedido = await pedidoDe();
        const ajeno = Object.assign(new Error("unique ajeno"), {
          code: "P2002",
          meta: { target: ["otraColumna"] },
        });
        const espia = mock.method(ventaRepository, "crear", () => Promise.reject(ajeno));

        try {
          await assert.rejects(ventaService.registrarVentaDePedido(pedido.id), (error) => {
            assert.equal(error, ajeno);
            return true;
          });
        } finally {
          espia.mock.restore();
        }
        assert.equal(await ventasDe(pedido.id), 0);
      });
    });

    describe("atomicidad", () => {
      it("con tx: si algo falla después, la venta se revierte junto con el resto de la transacción", async () => {
        const pedido = await pedidoDe({ estado: "PENDIENTE" });

        await assert.rejects(
          prisma.$transaction(async (tx) => {
            await tx.pedido.update({ where: { id: pedido.id }, data: { estado: "CONFIRMADO" } });
            await ventaService.registrarVentaDePedido(pedido.id, {}, tx);
            throw new Error("falla posterior");
          }),
          /falla posterior/
        );

        assert.equal(await ventasDe(pedido.id), 0);
        assert.equal((await prisma.pedido.findUnique({ where: { id: pedido.id } })).estado, "PENDIENTE");
      });

      it("un responsable inexistente (FK) falla y revierte el cambio de estado de la misma transacción", async () => {
        const pedido = await pedidoDe({ estado: "PENDIENTE" });

        await assert.rejects(
          prisma.$transaction(async (tx) => {
            await tx.pedido.update({ where: { id: pedido.id }, data: { estado: "CONFIRMADO" } });
            await ventaService.registrarVentaDePedido(pedido.id, { responsableId: ID_INEXISTENTE }, tx);
          }),
          (error) => error.code === "P2003"
        );

        assert.equal(await ventasDe(pedido.id), 0);
        assert.equal((await prisma.pedido.findUnique({ where: { id: pedido.id } })).estado, "PENDIENTE");
      });
    });
  });

  describe("anularVentaDePedido", () => {
    it("pasa la venta a ANULADA con anuladaEn, devuelve { anulada: true } y no borra la fila", async () => {
      const pedido = await pedidoDe();
      const { venta } = await ventaService.registrarVentaDePedido(pedido.id, {
        responsableId: admin.id,
      });

      const resultado = await ventaService.anularVentaDePedido(pedido.id, {
        responsableId: vendedor.id,
      });

      assert.deepEqual(resultado, { anulada: true });
      const despues = await prisma.venta.findUnique({ where: { id: venta.id } });
      assert.equal(despues.estado, "ANULADA");
      assert.ok(despues.anuladaEn instanceof Date);
      // La anulación no pisa los montos ni a quien la registró.
      assert.equal(despues.total.toFixed(2), "32690.00");
      assert.equal(despues.responsableId, admin.id);
      assert.equal(await ventasDe(pedido.id), 1);
    });

    it("es idempotente: la segunda anulación devuelve { anulada: false }, no lanza y conserva la primera anuladaEn", async () => {
      const pedido = await pedidoDe();
      await ventaService.registrarVentaDePedido(pedido.id);
      await ventaService.anularVentaDePedido(pedido.id);
      const primera = await prisma.venta.findUnique({ where: { pedidoId: pedido.id } });

      const resultado = await ventaService.anularVentaDePedido(pedido.id);

      assert.deepEqual(resultado, { anulada: false });
      const despues = await prisma.venta.findUnique({ where: { pedidoId: pedido.id } });
      assert.equal(despues.anuladaEn.getTime(), primera.anuladaEn.getTime());
    });

    it("un pedido que nunca tuvo venta no es error: { anulada: false }", async () => {
      const pedido = await pedidoDe({ estado: "PENDIENTE" });

      assert.deepEqual(await ventaService.anularVentaDePedido(pedido.id), { anulada: false });
      assert.deepEqual(await ventaService.anularVentaDePedido(ID_INEXISTENTE), { anulada: false });
    });

    it("con tx: si la transacción se revierte, la venta sigue REGISTRADA", async () => {
      const pedido = await pedidoDe();
      await ventaService.registrarVentaDePedido(pedido.id);

      await assert.rejects(
        prisma.$transaction(async (tx) => {
          const { anulada } = await ventaService.anularVentaDePedido(pedido.id, {}, tx);
          assert.equal(anulada, true);
          throw new Error("falla posterior");
        }),
        /falla posterior/
      );

      const venta = await prisma.venta.findUnique({ where: { pedidoId: pedido.id } });
      assert.equal(venta.estado, "REGISTRADA");
      assert.equal(venta.anuladaEn, null);
    });
  });
});
