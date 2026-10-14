const prisma = require("../config/prisma");

// `estado` de ZonaCobertura y TarifaEnvio es el enum EstadoProducto
// ("ACTIVO" / "INACTIVO"), no un Boolean. ZonaCobertura tiene unique
// (departamento, ciudad): crear una segunda zona para la misma ciudad lanza
// P2002, que el service debe traducir a 409.
//
// `client` es opcional en las operaciones de escritura para poder participar
// de un prisma.$transaction (mismo patrón que direccion.repository.js): fuera
// de una transacción usan el cliente centralizado de config/prisma.js.

// Crear una zona de cobertura
const crearZona = async (
  { nombre, departamento, ciudad, estado = "ACTIVO" },
  client = prisma
) => {
  return await client.zonaCobertura.create({
    data: {
      nombre,
      departamento,
      ciudad,
      estado,
    },
  });
};

// Listar todas las zonas de cobertura con su tarifa ACTIVA (el historial de
// tarifas inactivas no se trae: el panel solo necesita la vigente).
const listarZonas = async () => {
  return await prisma.zonaCobertura.findMany({
    include: {
      tarifas: {
        where: {
          estado: "ACTIVO",
        },
        orderBy: {
          id: "desc",
        },
      },
    },
    orderBy: [{ nombre: "asc" }, { id: "asc" }],
  });
};

// Una zona con su tarifa ACTIVA (null si no existe).
const obtenerZona = async (id, client = prisma) => {
  return await client.zonaCobertura.findUnique({
    where: {
      id,
    },
    include: {
      tarifas: {
        where: {
          estado: "ACTIVO",
        },
        orderBy: {
          id: "desc",
        },
      },
    },
  });
};

// Toma el lock de la fila de la zona (SELECT ... FOR UPDATE) dentro de una
// transacción: serializa los cambios concurrentes sobre una misma zona para
// que no queden dos tarifas ACTIVO. Devuelve true si la zona existe.
const bloquearZona = async (id, client) => {
  const filas = await client.$queryRaw`SELECT id FROM ZonaCobertura WHERE id = ${id} FOR UPDATE`;

  return filas.length > 0;
};

// Activar o desactivar una zona
const cambiarEstadoZona = async (id, estado, client = prisma) => {
  return await client.zonaCobertura.update({
    where: {
      id,
    },
    data: {
      estado,
    },
  });
};

// Habilitar o deshabilitar el pago contra entrega en una zona (RF-037)
const cambiarContraEntregaZona = async (id, permiteContraEntrega, client = prisma) => {
  return await client.zonaCobertura.update({
    where: {
      id,
    },
    data: {
      permiteContraEntrega,
    },
  });
};

// Crear una tarifa de envío para una zona
const crearTarifa = async (
  zonaCoberturaId,
  costo,
  estado = "ACTIVO",
  client = prisma
) => {
  return await client.tarifaEnvio.create({
    data: {
      zonaCoberturaId,
      costo,
      estado,
    },
  });
};

// Listar las tarifas de una zona
const listarTarifas = async (zonaCoberturaId) => {
  return await prisma.tarifaEnvio.findMany({
    where: {
      zonaCoberturaId,
    },
    orderBy: {
      id: "desc",
    },
  });
};

// Activar o desactivar una tarifa
const cambiarEstadoTarifa = async (id, estado, client = prisma) => {
  return await client.tarifaEnvio.update({
    where: {
      id,
    },
    data: {
      estado,
    },
  });
};

// Pasa a INACTIVO todas las tarifas ACTIVO de una zona (no se borran: el
// historial se conserva, RF-026).
const desactivarTarifasActivas = async (zonaCoberturaId, client = prisma) => {
  return await client.tarifaEnvio.updateMany({
    where: {
      zonaCoberturaId,
      estado: "ACTIVO",
    },
    data: {
      estado: "INACTIVO",
    },
  });
};

module.exports = {
  crearZona,
  listarZonas,
  obtenerZona,
  bloquearZona,
  cambiarEstadoZona,
  cambiarContraEntregaZona,
  crearTarifa,
  listarTarifas,
  cambiarEstadoTarifa,
  desactivarTarifasActivas,
};
