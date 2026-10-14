const prisma = require("../config/prisma");

// Sprint 4 / MOD-07: acceso a datos de Pago (relación 1:1 con Pedido por
// pedidoId @unique). `client` es opcional para poder participar de un
// prisma.$transaction (webhook de Mercado Pago); fuera de una transacción se
// usa el cliente centralizado de config/prisma.js.

async function crear(
  { pedidoId, metodo, monto, estado = "PENDIENTE", referenciaExterna = null },
  client = prisma
) {
  return client.pago.create({
    data: {
      pedidoId: Number(pedidoId),
      metodo,
      monto,
      estado,
      referenciaExterna,
    },
  });
}

async function buscarPorPedido(pedidoId, client = prisma) {
  return client.pago.findUnique({
    where: {
      pedidoId: Number(pedidoId),
    },
  });
}

async function actualizarEstado(pedidoId, estado, referenciaExterna, client = prisma) {
  return client.pago.update({
    where: {
      pedidoId: Number(pedidoId),
    },
    data: {
      estado,
      ...(referenciaExterna !== undefined ? { referenciaExterna } : {}),
    },
  });
}

// Crea o actualiza el Pago del pedido con el resultado informado por la
// pasarela (webhook de Mercado Pago).
async function guardarResultado(
  { pedidoId, metodo, estado, referenciaExterna, monto },
  client = prisma
) {
  return client.pago.upsert({
    where: { pedidoId: Number(pedidoId) },
    create: { pedidoId: Number(pedidoId), metodo, estado, referenciaExterna, monto },
    update: { estado, referenciaExterna, monto },
  });
}

module.exports = {
  crear,
  buscarPorPedido,
  actualizarEstado,
  guardarResultado,
};
