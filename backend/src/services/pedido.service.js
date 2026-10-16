const prisma = require("../config/prisma");
const pedidoRepository = require("../repositories/pedido.repository");
const ventaService = require("./venta.service"); 
const envioService = require("./envio.service");

// ...conservar las importaciones y funciones reales del service.

const actualizarEstado = async (id, nuevoEstado, usuarioId) => {
  // Conservar aquí la lógica existente para obtener el pedido
  // y validar la transición antes de modificarlo.
  //
  // Si la transición no es válida, lanzar
  // TransicionEstadoInvalidaError como ya lo hace Sprint 4.

  return prisma.$transaction(async (tx) => {
    const pedidoActualizado = await pedidoRepository.actualizarEstado(
      id,
      nuevoEstado,
      { tx }
    );

    // Regla de negocio: la venta nace cuando el pedido queda confirmado.
    if (ventaService.ESTADOS_QUE_CUENTAN.includes(nuevoEstado)) {
      await ventaService.registrarVentaDePedido(id, {
        tx,
        responsableId: usuarioId,
      });
    }

    if (nuevoEstado === "CANCELADO") {
      await ventaService.anularVentaDePedido(id, { tx });
    }

    return pedidoActualizado;
  });
};