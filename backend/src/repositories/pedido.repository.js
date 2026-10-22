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

// Líneas con lo que muestran el detalle del pedido y la preferencia de pago:
// nombre del producto, talla y color (el precio es el HISTÓRICO de la línea,
// RN-008, nunca el vigente del producto).
const DETALLES_CON_VARIANTE = {
  orderBy: { id: "asc" },
  include: {
    variante: {
      select: {
        id: true,
        sku: true,
        talla: true,
        color: true,
        producto: { select: { id: true, nombre: true } },
      },
    },
  },
};

// Dirección del pedido: solo los datos de entrega. Nunca la fila completa
// (usuarioId, esPrincipal y eliminadaEn son metadatos de la cuenta, RF-005).
const DIRECCION_DE_ENTREGA = {
  select: {
    id: true,
    destinatario: true,
    telefono: true,
    calle: true,
    ciudad: true,
    departamento: true,
    codigoPostal: true,
    referencia: true,
  },
};

// Detalle completo de un pedido (respuesta de crear, consultar y gestionar).
const INCLUDE_DETALLE = {
  detalles: DETALLES_CON_VARIANTE,
  usuario: USUARIO_PUBLICO,
  pago: true,
  infoEnvio: true,
  direccion: DIRECCION_DE_ENTREGA,
};

// RN-003: las consultas de un cliente siempre filtran por su usuarioId. Un
// usuarioId ausente en un `where` de Prisma se IGNORA (devolvería los pedidos
// de todos), así que se valida acá en vez de confiar en el llamador.
function exigirUsuarioId(usuarioId) {
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    throw new Error("usuarioId es obligatorio para consultar pedidos de un cliente");
  }
}

// Generar un número de pedido legible y único. Puede chocar (mismo
// milisegundo y mismo aleatorio): Pedido.numero es @unique y el service
// reintenta ante P2002.
const generarNumero = () => {
  const timestamp = Date.now().toString();
  const random = Math.floor(1000 + Math.random() * 9000).toString();

  return `PED-${timestamp}${random}`;
};

// Crear el pedido (y sus detalles si vienen `items`) en una sola operación.
// La creación desde el carrito lo llama SIN items y agrega las líneas
// después con crearDetalles: insertar un DetallePedido toma un lock
// compartido sobre la Variante (FK) y el descuento de stock posterior pediría
// el exclusivo, receta de deadlock entre dos pedidos simultáneos de la misma
// variante (ver inventario.repository.js).
const crear = async (
  { usuarioId, direccionId, metodoPago, subtotal, costoEnvio, total, items = [] },
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
      ...(items.length > 0 ? { detalles: { create: items } } : {}),
    },
    include: {
      detalles: true,
    },
  });
};

// Líneas del pedido: [{ varianteId, cantidad, precioUnitario }].
const crearDetalles = async (pedidoId, items, client = prisma) => {
  return await client.detallePedido.createMany({
    data: items.map((item) => ({ ...item, pedidoId })),
  });
};

// `where` común de los listados (RF-031/RF-032). `desde`/`hasta` son Date ya
// resueltos por el service (`hasta` exclusivo).
function construirFiltro({ estado, numero, usuarioId, desde, hasta } = {}) {
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

  if (desde || hasta) {
    where.creadoEn = {
      ...(desde ? { gte: desde } : {}),
      ...(hasta ? { lt: hasta } : {}),
    };
  }

  return where;
}

// Listar pedidos de un usuario, más recientes primero (RN-003). Mismos
// filtros y paginación que listarTodos, pero con el dueño obligatorio (nunca
// se puede "olvidar" el filtro y devolver los de todos).
const listarPorUsuario = async (usuarioId, filtros = {}) => {
  exigirUsuarioId(usuarioId);

  return listarTodos({ ...filtros, usuarioId });
};

// Listar pedidos para administración y vendedores (RF-032), con filtros y
// paginación (`skip`/`take`), más recientes primero. Devuelve
// { pedidos, total }.
const listarTodos = async ({ skip = 0, take = 20, ...filtros } = {}) => {
  const where = construirFiltro(filtros);

  const [pedidos, total] = await prisma.$transaction([
    prisma.pedido.findMany({
      where,
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      skip,
      take,
      include: {
        detalles: DETALLES_CON_VARIANTE,
        usuario: USUARIO_PUBLICO,
      },
    }),
    prisma.pedido.count({ where }),
  ]);

  return { pedidos, total };
};

// Obtener pedido por ID con sus relaciones (sin filtrar por dueño: para
// admin/vendedor o procesos internos como el webhook de pagos; el service
// compara el dueño cuando consulta un cliente).
const obtenerPorId = async (id, client = prisma) => {
  return await client.pedido.findUnique({
    where: {
      id,
    },
    include: INCLUDE_DETALLE,
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
      direccion: DIRECCION_DE_ENTREGA,
    },
  });
};

// Toma el lock de la fila del pedido (SELECT ... FOR UPDATE) dentro de una
// transacción y devuelve { id, estado, usuarioId, metodoPago, creadoEn } o
// null. Serializa los eventos concurrentes sobre un mismo pedido (pagos
// RN-009, cancelación, cambios de estado y de envío): el segundo espera al
// primero y ya ve lo que éste confirmó. Es una lectura con lock, así que
// devuelve siempre el valor vigente (no el de una foto vieja).
const bloquearPedido = async (id, client) => {
  const filas =
    await client.$queryRaw`SELECT id, estado, usuarioId, metodoPago, creadoEn FROM Pedido WHERE id = ${id} FOR UPDATE`;

  return filas[0] ?? null;
};

// Líneas de un pedido ({ varianteId, cantidad }), para reponer el stock al
// cancelarlo. Con `client` se leen bajo el lock del pedido.
const obtenerLineas = async (pedidoId, client = prisma) => {
  return await client.detallePedido.findMany({
    where: { pedidoId },
    select: { varianteId: true, cantidad: true },
    orderBy: { varianteId: "asc" },
  });
};

// Candidatos a vencidos (MERCADO_PAGO, PENDIENTE, creados antes de `corte`,
// sin Pago APROBADO). Solo ids: cada uno se vuelve a validar bajo su lock.
const listarIdsVencidos = async (corte) => {
  const filas = await prisma.pedido.findMany({
    where: {
      metodoPago: "MERCADO_PAGO",
      estado: "PENDIENTE",
      creadoEn: { lt: corte },
      NOT: { pago: { is: { estado: "APROBADO" } } },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  return filas.map((fila) => fila.id);
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
  crearDetalles,
  listarPorUsuario,
  listarTodos,
  obtenerPorId,
  obtenerDeUsuario,
  bloquearPedido,
  obtenerLineas,
  listarIdsVencidos,
  actualizarEstado,
};
