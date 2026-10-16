
const prisma = require("../config/prisma");

const ESTADOS_ENVIO = [
  "EN_PREPARACION",
  "ENVIADO",
  "EN_TRANSITO",
  "ENTREGADO",
];

const TRANSICIONES_VALIDAS = {
  EN_PREPARACION: ["ENVIADO"],
  ENVIADO: ["EN_TRANSITO"],
  EN_TRANSITO: ["ENTREGADO"],
  ENTREGADO: [],
};

const validarTransicionEstado = (estadoActual, nuevoEstado) => {
  const permitidos = TRANSICIONES_VALIDAS[estadoActual] || [];

  if (!ESTADOS_ENVIO.includes(nuevoEstado) ||
      !permitidos.includes(nuevoEstado)) {
    const error = new Error(
      `No se puede cambiar el envío de ${estadoActual} a ${nuevoEstado}.`
    );
    error.status = 409;
    error.codigo = "TRANSICION_ENVIO_INVALIDA";
    throw error;
  }
};

const crearInfoEnvio = async (
  pedidoId,
  direccionId,
  costoEnvio,
  { tx } = {}
) => {
  const db = tx ?? prisma;

  return db.infoEnvio.create({
    data: {
      pedidoId,
      estado: "EN_PREPARACION",
      // Agrega direccionId y costoEnvio solo si
      // esos campos existen en el modelo InfoEnvio.
    },
  });
};

const actualizarEstadoEnvio = async (
  pedidoId,
  nuevoEstado,
  usuarioId,
  { tx } = {}
) => {
  const db = tx ?? prisma;

  const infoEnvio = await db.infoEnvio.findUnique({
    where: { pedidoId },
  });

  if (!infoEnvio) {
    const error = new Error(
      "No existe información de envío para este pedido."
    );
    error.status = 404;
    error.codigo = "INFO_ENVIO_NO_ENCONTRADA";
    throw error;
  }

  validarTransicionEstado(infoEnvio.estado, nuevoEstado);

  return db.infoEnvio.update({
    where: { pedidoId },
    data: {
      estado: nuevoEstado,
      // Agrega el campo de usuario responsable únicamente
      // si existe en el modelo Prisma.
    },
  });
};

module.exports = {
  ESTADOS_ENVIO,
  validarTransicionEstado,
  crearInfoEnvio,
  actualizarEstadoEnvio,
};
