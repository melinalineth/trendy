const prisma = require("../config/prisma");

// Sprint 4 (MOD-06/MOD-07): acceso a datos de Pedido. Usa el cliente único de
// config/prisma.js (Prisma 7 necesita el adapter; un `new PrismaClient()`
// suelto no conecta). `client` es opcional en las operaciones que pueden
// participar de un prisma.$transaction (mismo patrón que
// zonaCobertura.repository.js).
//
// Datos del usuario: NUNCA `include: { usuario: true }`, que expondría
// passwordHash, rolId, estado, etc. en las respuestas; solo estos campos.
const USUARIO_PUBLICO = { select: { id: true, nombre: true, correo: true } };

// RN-003: las consultas de un cliente siempre filtran por su usuarioId. Un
// usuarioId ausente en un `where` de Prisma se IGNORA (devolvería los pedidos
// de todos), así que se valida acá en vez de confiar en el llamador.
function exigirUsuarioId(usuarioId) {
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    throw new Error("usuarioId es obligatorio para consultar pedidos de un cliente");
  }
}

// Generar un número de pedido legible y único
const generarNumero = () => {
  const timestamp = Date.now().toString();
  const random = Math.floor(1000 + Math.random() * 9000).toString();

  return `PED-${timestamp}${random}`;
};

// Crear pedido y sus detalles en una sola operación
const crear = async (
  { usuarioId, direccionId, metodoPago, subtotal, costoEnvio, total, items },
  client = prisma
) => {
  const numero = generarNumero();

  return await client.pedido.create({
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

// Listar pedidos de un usuario, más recientes primero (RN-003)
const listarPorUsuario = async (usuarioId) => {
  exigirUsuarioId(usuarioId);

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
      usuario: USUARIO_PUBLICO,
    },
  });
};

// Obtener pedido por ID con sus relaciones (sin filtrar por dueño: para
// admin/vendedor o procesos internos como el webhook de pagos).
const obtenerPorId = async (id, client = prisma) => {
  return await client.pedido.findUnique({
    where: {
      id,
    },
    include: {
      detalles: true,
      usuario: USUARIO_PUBLICO,
      pago: true,
      infoEnvio: true,
    },
  });
};

// Pedido de un cliente concreto (RN-003): uno ajeno llega como null, igual que
// uno inexistente, para no revelar que existe. Trae lo que necesitan los
// pagos: líneas con el nombre del producto (preferencia de Mercado Pago) y la
// dirección (zona de contra entrega).
const obtenerDeUsuario = async (id, usuarioId) => {
  exigirUsuarioId(usuarioId);

  return await prisma.pedido.findFirst({
    where: {
      id,
      usuarioId,
    },
    include: {
      detalles: {
        include: {
          variante: {
            include: {
              producto: { select: { nombre: true } },
            },
          },
        },
      },
      direccion: true,
    },
  });
};

// Toma el lock de la fila del pedido (SELECT ... FOR UPDATE) dentro de una
// transacción y devuelve { id, estado, usuarioId } o null. Serializa los
// eventos de pago concurrentes sobre un mismo pedido (RN-009): el segundo
// espera al primero y ya ve el Pago actualizado.
const bloquearPedido = async (id, client) => {
  const filas = await client.$queryRaw`SELECT id, estado, usuarioId FROM Pedido WHERE id = ${id} FOR UPDATE`;

  return filas[0] ?? null;
};

// Actualizar únicamente el estado del pedido
const actualizarEstado = async (id, estado, client = prisma) => {
  return await client.pedido.update({
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
  obtenerDeUsuario,
  bloquearPedido,
  actualizarEstado,
};
