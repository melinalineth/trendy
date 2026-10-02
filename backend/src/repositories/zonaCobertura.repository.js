const prisma = require("../config/prisma");

// `estado` de ZonaCobertura y TarifaEnvio es el enum EstadoProducto
// ("ACTIVO" / "INACTIVO"), no un Boolean. ZonaCobertura tiene unique
// (departamento, ciudad): crear una segunda zona para la misma ciudad lanza
// P2002, que el service debe traducir a 409.

// Crear una zona de cobertura
const crearZona = async ({ nombre, departamento, ciudad, estado = "ACTIVO" }) => {
  return await prisma.zonaCobertura.create({
    data: {
      nombre,
      departamento,
      ciudad,
      estado,
    },
  });
};

// Listar todas las zonas de cobertura
const listarZonas = async () => {
  return await prisma.zonaCobertura.findMany({
    include: {
      tarifas: true,
    },
    orderBy: {
      nombre: "asc",
    },
  });
};

// Activar o desactivar una zona
const cambiarEstadoZona = async (id, estado) => {
  return await prisma.zonaCobertura.update({
    where: {
      id,
    },
    data: {
      estado,
    },
  });
};

// Crear una tarifa de envío para una zona
const crearTarifa = async (zonaCoberturaId, costo, estado = "ACTIVO") => {
  return await prisma.tarifaEnvio.create({
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
const cambiarEstadoTarifa = async (id, estado) => {
  return await prisma.tarifaEnvio.update({
    where: {
      id,
    },
    data: {
      estado,
    },
  });
};

module.exports = {
  crearZona,
  listarZonas,
  cambiarEstadoZona,
  crearTarifa,
  listarTarifas,
  cambiarEstadoTarifa,
};