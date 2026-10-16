
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const prisma = require("../src/config/prisma");
const ventaService = require("../src/services/venta.service");

const {
  crearUsuario,
  crearVariante,
  crearZona,
  crearDireccion,
  crearPedido,
  limpiar,
} = require("./helpers/entorno");

describe("venta.service — registro y anulación", () => {
  let cliente;
  let responsable;
  let variante;
  let zona;
  let direccion;

  before(async () => {
    cliente = await crearUsuario();
    responsable = await crearUsuario();

    variante = await crearVariante();
    zona = await crearZona({ permiteContraEntrega: true });
    direccion = await crearDireccion(cliente.id, zona.id);
  });

  after(async () => {
    await limpiar();
  });

  const crearPedidoDePrueba = async (estado = "CONFIRMADO", opciones = {}) =>
    crearPedido(cliente.id, direccion.id, variante, {
      estado,
      metodoPago: "CONTRA_ENTREGA",
      cantidad: 2,
      precioUnitario: "19990.50",
      costoEnvio: "5000.00",
      ...opciones,
    });

  const assertErrorNegocio = async (promesa, status, codigo) => {
    await assert.rejects(promesa, (error) => {
      assert.equal(error.status, status);
      assert.equal(error.codigo, codigo);
      return true;
    });
  };

  const contarVentas = (pedidoId) =>
    prisma.venta.count({ where: { pedidoId } });

  it("rechaza un pedido PENDIENTE sin registrar una venta", async () => {
    const pedido = await crearPedidoDePrueba("PENDIENTE");

    await assertErrorNegocio(
      ventaService.registrarVentaDePedido(pedido.id),
      409,
      "PEDIDO_NO_CONFIRMADO"
    );

    assert.equal(await contarVentas(pedido.id), 0);
  });

  it("rechaza pedidos PAGO_RECHAZADO y CANCELADO", async () => {
    for (const estado of ["PAGO_RECHAZADO", "CANCELADO"]) {
      const pedido = await crearPedidoDePrueba(estado);

      await assertErrorNegocio(
        ventaService.registrarVentaDePedido(pedido.id),
        409,
        "PEDIDO_NO_CONFIRMADO"
      );

      assert.equal(await contarVentas(pedido.id), 0);
    }
  });

  it("rechaza un pedido inexistente con PEDIDO_NO_ENCONTRADO", async () => {
    await assertErrorNegocio(
      ventaService.registrarVentaDePedido(999999999),
      404,
      "PEDIDO_NO_ENCONTRADO"
    );
  });

  it("registra una venta con los importes históricos del pedido", async () => {
    const pedido = await crearPedidoDePrueba("CONFIRMADO");

    const resultado = await ventaService.registrarVentaDePedido(
      pedido.id,
      { responsableId: responsable.id }
    );

    assert.equal(resultado.creada, true);
    assert.equal(resultado.venta.estado, "REGISTRADA");
    assert.equal(resultado.venta.pedidoId, pedido.id);
    assert.equal(resultado.venta.clienteId, pedido.usuarioId);
    assert.equal(resultado.venta.responsableId, responsable.id);

    assert.equal(
      resultado.venta.subtotal.toString(),
      pedido.subtotal.toString()
    );
    assert.equal(
      resultado.venta.costoEnvio.toString(),
      pedido.costoEnvio.toString()
    );
    assert.equal(
      resultado.venta.total.toString(),
      pedido.total.toString()
    );
    assert.equal(resultado.venta.metodoPago, pedido.metodoPago);

    assert.equal(await contarVentas(pedido.id), 1);
  });

  it("es idempotente ante llamadas secuenciales", async () => {
    const pedido = await crearPedidoDePrueba("CONFIRMADO");

    const primera = await ventaService.registrarVentaDePedido(pedido.id);
    const segunda = await ventaService.registrarVentaDePedido(pedido.id);

    assert.equal(primera.creada, true);
    assert.equal(segunda.creada, false);
    assert.equal(segunda.venta.id, primera.venta.id);
    assert.equal(await contarVentas(pedido.id), 1);
  });

  it("tolera dos registros simultáneos sin duplicar la venta", async () => {
    const pedido = await crearPedidoDePrueba("CONFIRMADO");

    const resultados = await Promise.all([
      ventaService.registrarVentaDePedido(pedido.id),
      ventaService.registrarVentaDePedido(pedido.id),
    ]);

    assert.equal(resultados.length, 2);
    assert.equal(resultados.filter((r) => r.creada).length, 1);
    assert.equal(resultados[0].venta.id, resultados[1].venta.id);
    assert.equal(await contarVentas(pedido.id), 1);
  });

  it("conserva los precios históricos aunque cambie Producto.precio", async () => {
    const pedido = await crearPedidoDePrueba("CONFIRMADO");

    const detalleAntes = await prisma.detallePedido.findFirst({
      where: { pedidoId: pedido.id },
      select: { id: true, precioUnitario: true },
    });

    assert.ok(detalleAntes);

    const ventaAntes = await ventaService.registrarVentaDePedido(pedido.id);

    const productoId = variante.productoId ?? variante.producto?.id;
    assert.ok(productoId, "La variante debe identificar su producto");

    const productoAntes = await prisma.producto.findUniqueOrThrow({
      where: { id: productoId },
      select: { precio: true },
    });

    try {
      await prisma.producto.update({
        where: { id: productoId },
        data: { precio: "99999.99" },
      });

      const ventaDespues = await prisma.venta.findUniqueOrThrow({
        where: { id: ventaAntes.venta.id },
      });

      const detalleDespues = await prisma.detallePedido.findUniqueOrThrow({
        where: { id: detalleAntes.id },
        select: { precioUnitario: true },
      });

      assert.equal(
        ventaDespues.total.toString(),
        pedido.total.toString()
      );
      assert.equal(
        ventaDespues.subtotal.toString(),
        pedido.subtotal.toString()
      );
      assert.equal(
        detalleDespues.precioUnitario.toString(),
        detalleAntes.precioUnitario.toString()
      );
    } finally {
      await prisma.producto.update({
        where: { id: productoId },
        data: { precio: productoAntes.precio },
      });
    }
  });

  it("anula una venta y devuelve false al anularla otra vez", async () => {
    const pedido = await crearPedidoDePrueba("CONFIRMADO");

    await ventaService.registrarVentaDePedido(pedido.id);

    const primera = await ventaService.anularVentaDePedido(pedido.id);
    const segunda = await ventaService.anularVentaDePedido(pedido.id);

    assert.equal(primera.anulada, true);
    assert.equal(segunda.anulada, false);

    const venta = await prisma.venta.findUniqueOrThrow({
      where: { pedidoId: pedido.id },
    });

    assert.equal(venta.estado, "ANULADA");
    assert.ok(venta.anuladaEn instanceof Date);
  });

  it("no falla al anular un pedido que nunca tuvo venta", async () => {
    const pedido = await crearPedidoDePrueba("CANCELADO");

    const resultado = await ventaService.anularVentaDePedido(pedido.id);

    assert.deepEqual(resultado, { anulada: false });
    assert.equal(await contarVentas(pedido.id), 0);
  });

  it("revierte la venta si la transacción falla después de registrarla", async () => {
    const pedido = await crearPedidoDePrueba("CONFIRMADO");

    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await ventaService.registrarVentaDePedido(pedido.id, {
          tx,
          responsableId: responsable.id,
        });

        throw new Error("Fallo intencional para probar rollback");
      }),
      /Fallo intencional para probar rollback/
    );

    assert.equal(await contarVentas(pedido.id), 0);
  });

  it("no exporta funciones para modificar o eliminar ventas", () => {
    assert.equal(typeof ventaService.registrarVentaDePedido, "function");
    assert.equal(typeof ventaService.anularVentaDePedido, "function");

    assert.equal("actualizarVenta" in ventaService, false);
    assert.equal("eliminarVenta" in ventaService, false);
    assert.equal("actualizar" in ventaService, false);
    assert.equal("eliminar" in ventaService, false);
    assert.equal("borrar" in ventaService, false);
  });
});
