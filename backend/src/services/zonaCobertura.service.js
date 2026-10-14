const prisma = require("../config/prisma");
const zonaRepository = require("../repositories/zonaCobertura.repository");
const {
  validarCrearZonaCobertura,
  validarCambiarTarifa,
  validarCambiarEstado,
} = require("../dtos/zonaCobertura.dto");

// RF-026 (DDS §3 MOD-05): administración de zonas de cobertura y tarifas.
//
// Reglas de negocio:
//   - (departamento, ciudad) es único: una ciudad pertenece a una sola zona
//     (409 ZONA_DUPLICADA).
//   - Una zona tiene UNA SOLA tarifa ACTIVO. Cambiar la tarifa desactiva la
//     anterior y crea la nueva en la misma transacción; las tarifas viejas
//     quedan INACTIVO (nunca se borran): el costo ya cobrado en un pedido no
//     depende de la tarifa viva, pero el historial se conserva (RF-026).
//   - Los datos se validan acá (con el DTO) y no solo en el controller, para
//     que la regla "no se permite una tarifa inválida" no se pueda burlar
//     llamando al service por otra vía.
//
// Los errores de dominio traen `status` y `codigo`, que errorHandler.js
// formatea como { error: { codigo, mensaje, detalles } } (DDS §5.3).

class ZonaDuplicadaError extends Error {
  constructor(message = "Ya existe una zona de cobertura para ese departamento y ciudad") {
    super(message);
    this.name = "ZonaDuplicadaError";
    this.status = 409;
    this.codigo = "ZONA_DUPLICADA";
  }
}

class ZonaNoEncontradaError extends Error {
  constructor(message = "La zona de cobertura no existe") {
    super(message);
    this.name = "ZonaNoEncontradaError";
    this.status = 404;
    this.codigo = "ZONA_NO_ENCONTRADA";
  }
}

// Forma de respuesta de una zona: la tarifa vigente va como `tarifaActiva`
// (null si la zona no tiene ninguna activa) y el costo como Number.
function presentarZona(zona) {
  const tarifa = zona.tarifas?.[0] ?? null;

  return {
    id: zona.id,
    nombre: zona.nombre,
    departamento: zona.departamento,
    ciudad: zona.ciudad,
    estado: zona.estado,
    tarifaActiva: tarifa
      ? { id: tarifa.id, costo: Number(tarifa.costo), estado: tarifa.estado }
      : null,
  };
}

async function listar() {
  const zonas = await zonaRepository.listarZonas();

  return zonas.map(presentarZona);
}

async function crear(body) {
  const { nombre, departamento, ciudad, tarifa } = validarCrearZonaCobertura(body);

  try {
    // Zona + tarifa inicial en una transacción: no puede quedar una zona
    // activa sin tarifa por una falla a mitad de camino.
    const zonaId = await prisma.$transaction(async (tx) => {
      const zona = await zonaRepository.crearZona({ nombre, departamento, ciudad }, tx);
      await zonaRepository.crearTarifa(zona.id, tarifa.costo, "ACTIVO", tx);

      return zona.id;
    });

    return presentarZona(await zonaRepository.obtenerZona(zonaId));
  } catch (error) {
    // P2002: unique (departamento, ciudad). La collation de MySQL no
    // distingue mayúsculas ni tildes, igual que buscarZonaPorDireccion.
    if (error?.code === "P2002") {
      throw new ZonaDuplicadaError();
    }

    throw error;
  }
}

async function cambiarTarifa(zonaId, body) {
  const { costo } = validarCambiarTarifa(body);

  await prisma.$transaction(async (tx) => {
    // El lock de la fila de la zona serializa cambios concurrentes: sin él,
    // dos requests simultáneos podrían dejar dos tarifas ACTIVO.
    if (!(await zonaRepository.bloquearZona(zonaId, tx))) {
      throw new ZonaNoEncontradaError();
    }

    await zonaRepository.desactivarTarifasActivas(zonaId, tx);
    await zonaRepository.crearTarifa(zonaId, costo, "ACTIVO", tx);
  });

  return presentarZona(await zonaRepository.obtenerZona(zonaId));
}

async function cambiarEstado(zonaId, body) {
  const { estado } = validarCambiarEstado(body);

  await prisma.$transaction(async (tx) => {
    if (!(await zonaRepository.bloquearZona(zonaId, tx))) {
      throw new ZonaNoEncontradaError();
    }

    await zonaRepository.cambiarEstadoZona(zonaId, estado, tx);
  });

  return presentarZona(await zonaRepository.obtenerZona(zonaId));
}

module.exports = {
  listar,
  crear,
  cambiarTarifa,
  cambiarEstado,
  ZonaDuplicadaError,
  ZonaNoEncontradaError,
};
