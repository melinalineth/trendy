
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Generar un número de pedido legible y único
const generarNumero = () => {
  const timestamp = Date.now().toString();
  const random = Math.floor(1000 + Math.random() * 9000).toString();

  return `PED-${timestamp}${random}`;
};

// Crear pedido y sus detalles en una sola operación
const crear = async ({
  usuarioId,
  direccionId,
  metodoPago,
  subtotal,
  costoEnvio,
  total,
  items,
}) => {
  const numero = generarNumero();

  return await prisma.pedido.create({
    data: {
      numero,
      usuarioId,
      direccionId,
      metodoPago,
      subtotal,
      costoEnvio,
      total,
      detalles: {
        create: items,
      },
    },
    include: {
      detalles: true,
    },
  });
};

// Listar pedidos de un usuario, más recientes primero
const listarPorUsuario = async (usuarioId) => {
  return await prisma.pedido.findMany({
    where: {
      usuarioId,
    },
    orderBy: {
      creadoEn: "desc",
    },
    include: {
      detalles: true,
    },
  });
};

// Listar pedidos para administración y vendedores
const listarTodos = async ({ estado, numero, usuarioId } = {}) => {
  const where = {};

  if (estado) {
    where.estado = estado;
  }

  if (numero) {
    where.numero = {
      contains: numero,
    };
  }

  if (usuarioId !== undefined && usuarioId !== null) {
    where.usuarioId = usuarioId;
  }

  return await prisma.pedido.findMany({
    where,
    orderBy: {
      creadoEn: "desc",
    },
    include: {
      detalles: true,
      usuario: true,
    },
  });
};

// Obtener pedido por ID con sus relaciones
const obtenerPorId = async (id) => {
  return await prisma.pedido.findUnique({
    where: {
      id,
    },
    include: {
      detalles: true,
      usuario: true,
      pago: true,
      infoEnvio: true,
    },
  });
};

// Actualizar únicamente el estado del pedido
const actualizarEstado = async (id, estado) => {
  return await prisma.pedido.update({
    where: {
      id,
    },
    data: {
      estado,
    },
  });
};

module.exports = {
  generarNumero,
  crear,
  listarPorUsuario,
  listarTodos,
  obtenerPorId,
  actualizarEstado,
};
