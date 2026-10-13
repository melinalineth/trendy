
const prisma = require("../../prisma/client");

async function crear({
  pedidoId,
  metodo,
  monto,
  estado = "PENDIENTE",
  referenciaExterna = null,
}) {
  return prisma.pago.create({
    data: {
      pedidoId: Number(pedidoId),
      metodo,
      monto,
      estado,
      referenciaExterna,
    },
  });
}

async function buscarPorPedido(pedidoId) {
  return prisma.pago.findUnique({
    where: {
      pedidoId: Number(pedidoId),
    },
  });
}

async function actualizarEstado(
  pedidoId,
  estado,
  referenciaExterna
) {
  return prisma.pago.update({
    where: {
      pedidoId: Number(pedidoId),
    },
    data: {
      estado,
      ...(referenciaExterna !== undefined
        ? { referenciaExterna }
        : {}),
    },
  });
}

module.exports = {
  crear,
  buscarPorPedido,
  actualizarEstado,
};
