const direccionRepository = require("../repositories/direccion.repository");
const envioRepository = require("../repositories/envio.repository");

class CoberturaNoDisponibleError extends Error {
  constructor(message = "La dirección seleccionada no tiene cobertura de envío") {
    super(message);
    this.name = "CoberturaNoDisponibleError";
  }
}

class DireccionNoAutorizadaError extends Error {
  constructor(message = "La dirección no pertenece al usuario autenticado") {
    super(message);
    this.name = "DireccionNoAutorizadaError";
  }
}

/**
 * Calcula el costo de envío para una dirección del usuario.
 *
 * 1. Obtiene la dirección.
 * 2. Verifica que pertenezca al usuario autenticado.
 * 3. Busca la zona de cobertura.
 * 4. Obtiene la tarifa activa.
 * 5. Retorna el costo.
 */
async function calcularCosto(direccionId, usuarioId) {
  // 1. Obtener la dirección usando el repository existente
  const direccion = await direccionRepository.obtenerPorId(direccionId);

  if (!direccion) {
    const error = new Error("La dirección no existe");
    error.status = 404;
    throw error;
  }

  // 2. RN-003: la dirección debe pertenecer al usuario autenticado
  if (Number(direccion.usuarioId) !== Number(usuarioId)) {
    throw new DireccionNoAutorizadaError();
  }

  // 3. Buscar la zona de cobertura según ciudad y departamento
  const zona = await envioRepository.buscarZonaPorDireccion(
    direccion.ciudad,
    direccion.departamento
  );

  if (!zona) {
    throw new CoberturaNoDisponibleError(
      `No tenemos cobertura de envío para ${direccion.ciudad}, ${direccion.departamento}`
    );
  }

  // 4. Buscar una tarifa activa de la zona
  const tarifa = zona.tarifas?.find(
    (item) => item.estado === "ACTIVO"
  );

  if (!tarifa) {
    throw new CoberturaNoDisponibleError(
      "La zona seleccionada no tiene una tarifa de envío activa"
    );
  }

  // 5. Retornar el costo y datos útiles para el resumen
  return {
    costo: Number(tarifa.costo),
    zonaId: zona.id,
    tarifaId: tarifa.id,
  };
}

module.exports = {
  calcularCosto,
  CoberturaNoDisponibleError,
  DireccionNoAutorizadaError,
};