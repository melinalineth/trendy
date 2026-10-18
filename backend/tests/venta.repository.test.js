// Repository de ventas (Sprint 5, RF-041; RN-008, RN-009). Habla con la base
// real: copia de montos, unicidad por pedido, anulación idempotente y
// participación en una transacción (`{ tx }`).
//
// Uso: DATABASE_URL=mysql://... npm test (base descartable: ver entorno.js).
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  prisma,
  crearUsuario,
  crearVariante,
  crearDireccion,
  crearPedido,
  limpiar,
} = require("./helpers/entorno");
const ventaRepository = require("../src/repositories/venta.repository");

const ID_INEXISTENTE = 2147483000;

// Código de error de Prisma que lanza `promesa` (o null si no falla).
async function codigoDeError(promesa) {
  try {
    await promesa;
    return null;
  } catch (error) {
    return error.code ?? error.message;
  }
}

describe("Repository de ventas (RF-041)", () => {
  let cliente;
  let admin;
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

  const datosDe = (pedido, extra = {}) => ({
    pedidoId: pedido.id,
    clienteId: pedido.usuarioId,
    subtotal: pedido.subtotal,
    costoEnvio: pedido.costoEnvio,
    total: pedido.total,
    metodoPago: pedido.metodoPago,
    ...extra,
  });

  before(async () => {
    cliente = await crearUsuario("cliente");
    admin = await crearUsuario("admin");
    variante = await crearVariante({ precio: "12345.00", stock: 100 });
    direccion = await crearDireccion(cliente.id);
  });

  after(async () => {
    await limpiar();
  });

  // No se compara el conjunto exacto de exports: las consultas del listado de
  // ventas se suman a este módulo. Lo que no puede existir es modificar o borrar.
  it("expone leer, registrar y anular, y NO funciones para modificar o borrar (la historia no se modifica)", () => {
    for (const nombre of ["anular", "buscarPorPedido", "crear", "obtenerPedidoParaVenta"]) {
      assert.equal(typeof ventaRepository[nombre], "function", nombre);
    }
    for (const nombre of Object.keys(ventaRepository)) {
      assert.doesNotMatch(nombre, /update|actualizar|delete|eliminar|borrar|remove/i, nombre);
    }
  });

  describe("obtenerPedidoParaVenta", () => {
    it("devuelve SOLO lo necesario para copiar la venta (sin usuario ni relaciones)", async () => {
      const pedido = await pedidoDe({ metodoPago: "CONTRA_ENTREGA" });

      const leido = await ventaRepository.obtenerPedidoParaVenta(pedido.id);

      assert.deepEqual(Object.keys(leido).sort(), [
        "costoEnvio",
        "estado",
        "id",
        "metodoPago",
        "subtotal",
        "total",
        "usuarioId",
      ]);
      assert.equal(leido.id, pedido.id);
      assert.equal(leido.usuarioId, cliente.id);
      assert.equal(leido.estado, "CONFIRMADO");
      assert.equal(leido.metodoPago, "CONTRA_ENTREGA");
      assert.equal(leido.subtotal.toFixed(2), "24690.00");
      assert.equal(leido.costoEnvio.toFixed(2), "8000.00");
      assert.equal(leido.total.toFixed(2), "32690.00");
    });

    it("pedido inexistente -> null", async () => {
      assert.equal(await ventaRepository.obtenerPedidoParaVenta(ID_INEXISTENTE), null);
    });

    it("con tx lee el valor VIGENTE (lectura con lock), aunque la transacción ya tenga una foto vieja", async () => {
      const pedido = await pedidoDe({ estado: "PENDIENTE" });

      const leido = await prisma.$transaction(async (tx) => {
        // Esta lectura fija la foto (REPEATABLE READ) de la transacción.
        await tx.pedido.findUnique({ where: { id: pedido.id } });
        // Otro actor confirma el pedido por fuera de la transacción.
        await prisma.pedido.update({ where: { id: pedido.id }, data: { estado: "CONFIRMADO" } });

        return ventaRepository.obtenerPedidoParaVenta(pedido.id, { tx });
      });

      assert.equal(leido.estado, "CONFIRMADO");
    });
  });

  describe("buscarPorPedido", () => {
    it("sin venta -> null; con venta la devuelve", async () => {
      const pedido = await pedidoDe();
      assert.equal(await ventaRepository.buscarPorPedido(pedido.id), null);

      const creada = await ventaRepository.crear(datosDe(pedido));

      const encontrada = await ventaRepository.buscarPorPedido(pedido.id);
      assert.equal(encontrada.id, creada.id);
      assert.equal(encontrada.pedidoId, pedido.id);
    });

    it("con tx y bloquear lee la venta VIGENTE aunque la transacción tenga una foto vieja", async () => {
      const pedido = await pedidoDe();

      const leida = await prisma.$transaction(async (tx) => {
        await tx.venta.findUnique({ where: { pedidoId: pedido.id } }); // fija la foto
        await ventaRepository.crear(datosDe(pedido)); // otro actor, ya confirmada

        return ventaRepository.buscarPorPedido(pedido.id, { tx, bloquear: true });
      });

      assert.equal(leida?.pedidoId, pedido.id);
      assert.equal(leida.estado, "REGISTRADA");
      assert.equal(leida.total.toFixed(2), "32690.00");
    });
  });

  describe("crear", () => {
    it("registra la venta REGISTRADA con los montos copiados y responsableId NULL por defecto", async () => {
      const pedido = await pedidoDe({ metodoPago: "MERCADO_PAGO" });

      const venta = await ventaRepository.crear(datosDe(pedido));

      assert.equal(venta.estado, "REGISTRADA");
      assert.equal(venta.clienteId, cliente.id);
      assert.equal(venta.responsableId, null);
      assert.equal(venta.anuladaEn, null);
      assert.equal(venta.metodoPago, "MERCADO_PAGO");
      assert.equal(venta.subtotal.toFixed(2), "24690.00");
      assert.equal(venta.costoEnvio.toFixed(2), "8000.00");
      assert.equal(venta.total.toFixed(2), "32690.00");
    });

    it("guarda el responsable cuando viene", async () => {
      const pedido = await pedidoDe();

      const venta = await ventaRepository.crear(datosDe(pedido, { responsableId: admin.id }));

      assert.equal(venta.responsableId, admin.id);
    });

    it("una segunda venta para el mismo pedido choca con el unique (P2002)", async () => {
      const pedido = await pedidoDe();
      await ventaRepository.crear(datosDe(pedido));

      const codigo = await codigoDeError(ventaRepository.crear(datosDe(pedido)));

      assert.equal(codigo, "P2002");
      assert.equal(await prisma.venta.count({ where: { pedidoId: pedido.id } }), 1);
    });

    it("con tx participa de la transacción: si se revierte, la venta no queda", async () => {
      const pedido = await pedidoDe();

      await assert.rejects(
        prisma.$transaction(async (tx) => {
          await ventaRepository.crear(datosDe(pedido), { tx });
          throw new Error("falla posterior en la misma transacción");
        }),
        /falla posterior/
      );

      assert.equal(await prisma.venta.count({ where: { pedidoId: pedido.id } }), 0);
    });

    it("un responsable inexistente falla por la FK (P2003) y no deja la venta", async () => {
      const pedido = await pedidoDe();

      const codigo = await codigoDeError(
        ventaRepository.crear(datosDe(pedido, { responsableId: ID_INEXISTENTE }))
      );

      assert.equal(codigo, "P2003");
      assert.equal(await prisma.venta.count({ where: { pedidoId: pedido.id } }), 0);
    });
  });

  describe("anular", () => {
    it("pasa REGISTRADA -> ANULADA con anuladaEn, devuelve 1 y NO borra la fila", async () => {
      const pedido = await pedidoDe();
      const venta = await ventaRepository.crear(datosDe(pedido));

      const anuladas = await ventaRepository.anular(pedido.id);

      assert.equal(anuladas, 1);
      const despues = await prisma.venta.findUnique({ where: { id: venta.id } });
      assert.equal(despues.estado, "ANULADA");
      assert.ok(despues.anuladaEn instanceof Date);
      assert.ok(Math.abs(despues.anuladaEn.getTime() - Date.now()) < 60_000);
      // La anulación no reescribe los montos ni la atribución.
      assert.equal(despues.total.toFixed(2), "32690.00");
      assert.equal(despues.registradaEn.getTime(), venta.registradaEn.getTime());
    });

    it("persiste anuladaPorId junto con anuladaEn y no pisa responsableId (quien la registró)", async () => {
      const quienAnula = await crearUsuario("vendedor");
      const pedido = await pedidoDe();
      await ventaRepository.crear(datosDe(pedido, { responsableId: admin.id }));

      const anuladas = await ventaRepository.anular(pedido.id, { anuladaPorId: quienAnula.id });

      assert.equal(anuladas, 1);
      const despues = await prisma.venta.findUnique({ where: { pedidoId: pedido.id } });
      assert.equal(despues.estado, "ANULADA");
      assert.ok(despues.anuladaEn instanceof Date);
      assert.equal(despues.anuladaPorId, quienAnula.id);
      assert.equal(despues.responsableId, admin.id);
    });

    it("sin anuladaPorId (o con null) anula igual y deja anuladaPorId en NULL", async () => {
      const sinOpcion = await pedidoDe();
      const conNull = await pedidoDe();
      await ventaRepository.crear(datosDe(sinOpcion));
      await ventaRepository.crear(datosDe(conNull));

      assert.equal(await ventaRepository.anular(sinOpcion.id), 1);
      assert.equal(await ventaRepository.anular(conNull.id, { anuladaPorId: null }), 1);

      for (const pedido of [sinOpcion, conNull]) {
        const despues = await prisma.venta.findUnique({ where: { pedidoId: pedido.id } });
        assert.equal(despues.estado, "ANULADA");
        assert.ok(despues.anuladaEn instanceof Date);
        assert.equal(despues.anuladaPorId, null);
      }
    });

    it("una segunda anulación (por otro usuario) devuelve 0 y NO pisa ni anuladaEn ni anuladaPorId", async () => {
      const primero = await crearUsuario("vendedor");
      const segundo = await crearUsuario("admin");
      const pedido = await pedidoDe();
      await ventaRepository.crear(datosDe(pedido));
      await ventaRepository.anular(pedido.id, { anuladaPorId: primero.id });
      const primera = await prisma.venta.findUnique({ where: { pedidoId: pedido.id } });

      const anuladas = await ventaRepository.anular(pedido.id, { anuladaPorId: segundo.id });

      assert.equal(anuladas, 0);
      const despues = await prisma.venta.findUnique({ where: { pedidoId: pedido.id } });
      assert.equal(despues.anuladaPorId, primero.id);
      assert.equal(despues.anuladaEn.getTime(), primera.anuladaEn.getTime());
    });

    it("un anuladaPorId inexistente falla por la FK (P2003) y la venta sigue REGISTRADA", async () => {
      const pedido = await pedidoDe();
      await ventaRepository.crear(datosDe(pedido));

      const codigo = await codigoDeError(
        ventaRepository.anular(pedido.id, { anuladaPorId: ID_INEXISTENTE })
      );

      assert.equal(codigo, "P2003");
      const venta = await prisma.venta.findUnique({ where: { pedidoId: pedido.id } });
      assert.equal(venta.estado, "REGISTRADA");
      assert.equal(venta.anuladaPorId, null);
    });

    it("es idempotente: la segunda anulación devuelve 0 y conserva la primera anuladaEn", async () => {
      const pedido = await pedidoDe();
      await ventaRepository.crear(datosDe(pedido));
      await ventaRepository.anular(pedido.id);
      const primera = await prisma.venta.findUnique({ where: { pedidoId: pedido.id } });

      const anuladas = await ventaRepository.anular(pedido.id);

      assert.equal(anuladas, 0);
      const despues = await prisma.venta.findUnique({ where: { pedidoId: pedido.id } });
      assert.equal(despues.anuladaEn.getTime(), primera.anuladaEn.getTime());
    });

    it("un pedido sin venta no es error: devuelve 0", async () => {
      const pedido = await pedidoDe({ estado: "PENDIENTE" });

      assert.equal(await ventaRepository.anular(pedido.id), 0);
      assert.equal(await ventaRepository.anular(ID_INEXISTENTE), 0);
    });

    it("solo anula la venta de ese pedido", async () => {
      const uno = await pedidoDe();
      const otro = await pedidoDe();
      await ventaRepository.crear(datosDe(uno));
      await ventaRepository.crear(datosDe(otro));

      await ventaRepository.anular(uno.id);

      assert.equal((await prisma.venta.findUnique({ where: { pedidoId: otro.id } })).estado, "REGISTRADA");
    });

    it("con tx participa de la transacción: si se revierte, la venta sigue REGISTRADA", async () => {
      const pedido = await pedidoDe();
      await ventaRepository.crear(datosDe(pedido));

      await assert.rejects(
        prisma.$transaction(async (tx) => {
          assert.equal(await ventaRepository.anular(pedido.id, { tx }), 1);
          throw new Error("falla posterior en la misma transacción");
        }),
        /falla posterior/
      );

      const venta = await prisma.venta.findUnique({ where: { pedidoId: pedido.id } });
      assert.equal(venta.estado, "REGISTRADA");
      assert.equal(venta.anuladaEn, null);
    });

    it("con tx y anuladaPorId: si se revierte, tampoco queda quién la anuló", async () => {
      const quienAnula = await crearUsuario("vendedor");
      const pedido = await pedidoDe();
      await ventaRepository.crear(datosDe(pedido));

      await assert.rejects(
        prisma.$transaction(async (tx) => {
          assert.equal(await ventaRepository.anular(pedido.id, { tx, anuladaPorId: quienAnula.id }), 1);
          throw new Error("falla posterior en la misma transacción");
        }),
        /falla posterior/
      );

      const venta = await prisma.venta.findUnique({ where: { pedidoId: pedido.id } });
      assert.equal(venta.estado, "REGISTRADA");
      assert.equal(venta.anuladaPorId, null);
    });
  });
});
