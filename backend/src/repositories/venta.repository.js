
const prisma = require("../config/prisma");

const obtenerPedidoParaVenta = async (pedidoId, { tx } = {}) => {
  const db = tx ?? prisma;

  return db.pedido.findUnique({
    where: { id: pedidoId },
    select: {
      id: true,
      usuarioId: true,
      subtotal: true,
      costoEnvio: true,
      total: true,
      metodoPago: true,
      estado: true,
    },
  });
};

const buscarPorPedido = async (pedidoId, { tx } = {}) => {
  const db = tx ?? prisma;

  return db.venta.findUnique({
    where: { pedidoId },
  });
};

const crear = async (
  {
    pedidoId,
    clienteId,
    responsableId,
    subtotal,
    costoEnvio,
    total,
    metodoPago,
  },
  { tx } = {}
) => {
  const db = tx ?? prisma;

  return db.venta.create({
    data: {
      pedidoId,
      clienteId,
      responsableId,
      subtotal,
      costoEnvio,
      total,
      metodoPago,
    },
  });
};

const anular = async (pedidoId, { tx } = {}) => {
  const db = tx ?? prisma;

  const resultado = await db.venta.updateMany({
    where: {
      pedidoId,
      estado: "REGISTRADA",
    },
    data: {
      estado: "ANULADA",
      anuladaEn: new Date(),
    },
  });

  return resultado.count;
};

module.exports = {
  obtenerPedidoParaVenta,
  buscarPorPedido,
  crear,
  anular,
};

