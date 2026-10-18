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

// RF-029: estados de envío y su orden. Son los valores del enum EstadoEnvio
// que Sprint 4 incorporó al schema junto con InfoEnvio (ver
// docs/diseno/info-envio.md); hasta que ese modelo exista en esta rama se
// mantienen acá como constantes para que la regla viva en un solo lugar.
const ESTADOS_ENVIO = Object.freeze([
  "EN_PREPARACION",
  "ENVIADO",
  "EN_TRANSITO",
  "ENTREGADO",
]);

// Desde cada estado, únicamente el siguiente: lineal, hacia adelante y sin
// saltear pasos. ENTREGADO es terminal. Para permitir saltos bastaría con
// agregar los destinos acá; la función no cambia.
const TRANSICIONES_ENVIO = Object.freeze({
  EN_PREPARACION: Object.freeze(["ENVIADO"]),
  ENVIADO: Object.freeze(["EN_TRANSITO"]),
  EN_TRANSITO: Object.freeze(["ENTREGADO"]),
  ENTREGADO: Object.freeze([]),
});

// DDS §5.2: un valor fuera del conjunto definido es un error de validación
// de entrada (400)...
class EstadoEnvioInvalidoError extends Error {
  constructor(message) {
    super(message);
    this.name = "EstadoEnvioInvalidoError";
    this.status = 400;
    this.codigo = "ESTADO_ENVIO_INVALIDO";
  }
}

// ...mientras que pedir un cambio que el estado actual no admite es un
// conflicto de negocio (409). `status` y `codigo` viajan en el error, así
// errorHandler lo formatea sin tener que registrarlo.
class TransicionEnvioInvalidaError extends Error {
  constructor(message) {
    super(message);
    this.name = "TransicionEnvioInvalidaError";
    this.status = 409;
    this.codigo = "TRANSICION_ENVIO_INVALIDA";
  }
}

/**
 * Valida un cambio de estado de envío (RF-029). Función pura, sin DB.
 *
 * - Estado actual o nuevo fuera de ESTADOS_ENVIO -> EstadoEnvioInvalidoError (400).
 * - Mismo estado, retroceso, salto de pasos o salida de ENTREGADO ->
 *   TransicionEnvioInvalidaError (409).
 * - Si es válida devuelve el estado nuevo, listo para usar en el update.
 */
function validarTransicionEstado(estadoActual, estadoNuevo) {
  for (const estado of [estadoActual, estadoNuevo]) {
    // includes sobre el array (y no `in`/propiedad del objeto) para que
    // valores como "constructor" o "__proto__" no pasen por estados.
    if (typeof estado !== "string" || !ESTADOS_ENVIO.includes(estado)) {
      throw new EstadoEnvioInvalidoError(
        `Estado de envío desconocido: ${String(estado)}. Estados válidos: ${ESTADOS_ENVIO.join(", ")}`
      );
    }
  }

  if (!TRANSICIONES_ENVIO[estadoActual].includes(estadoNuevo)) {
    const siguientes = TRANSICIONES_ENVIO[estadoActual];
    throw new TransicionEnvioInvalidaError(
      `No se puede pasar el envío de ${estadoActual} a ${estadoNuevo}` +
        (siguientes.length > 0
          ? `; desde ${estadoActual} solo se puede pasar a ${siguientes.join(", ")}`
          : `; ${estadoActual} es un estado final`)
    );
  }

  return estadoNuevo;
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
  // 1. Obtener la dirección del usuario (RN-003: el repository filtra por
  // usuarioId, así que una dirección ajena llega como null, igual que una
  // inexistente, y no se revela que existe)
  const direccion = await direccionRepository.obtenerPorId(
    direccionId,
    usuarioId
  );

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

/**
 * Sprint 4 / RF-027: registra la información de envío de un pedido recién
 * creado (dirección, costo congelado y estado EN_PREPARACION) y, en la misma
 * transacción, la primera fila del historial (RF-028/RF-029: null ->
 * EN_PREPARACION, hecha por `usuarioId`, el cliente que crea el pedido). Debe
 * recibir el cliente `tx` de la transacción que crea el pedido, nunca el
 * `prisma` raíz.
 */
async function crearInfoEnvio({ pedidoId, direccionId, costoEnvio, usuarioId }, tx) {
  const info = await envioRepository.crearInfoEnvio({ pedidoId, direccionId, costoEnvio }, tx);

  await envioRepository.crearHistorial(
    {
      infoEnvioId: info.id,
      estadoAnterior: null,
      estadoNuevo: info.estadoEnvio,
      usuarioId,
    },
    tx
  );

  return info;
}

/**
 * Sprint 4 / RF-028 y RF-029: lleva un InfoEnvio ya leído (`info`) a
 * `estadoNuevo` y deja la fila anterior -> nuevo con el usuario que lo hizo.
 * Valida la transición (validarTransicionEstado: un cambio inválido o al mismo
 * estado lanza ANTES de escribir, así que no deja historial). Debe recibir el
 * cliente `tx` de la transacción que además cambia Pedido.estado, con el lock
 * del pedido tomado: el InfoEnvio, su historial y el pedido confirman o
 * revierten juntos. Devuelve el InfoEnvio actualizado.
 */
async function cambiarEstadoEnvio({ pedidoId, info, estadoNuevo, usuarioId }, tx) {
  validarTransicionEstado(info.estadoEnvio, estadoNuevo);

  const actualizado = await envioRepository.actualizarEstadoEnvio(pedidoId, estadoNuevo, tx);

  await envioRepository.crearHistorial(
    {
      infoEnvioId: info.id,
      estadoAnterior: info.estadoEnvio,
      estadoNuevo,
      usuarioId,
    },
    tx
  );

  return actualizado;
}

module.exports = {
  calcularCosto,
  crearInfoEnvio,
  cambiarEstadoEnvio,
  validarTransicionEstado,
  ESTADOS_ENVIO,
  TRANSICIONES_ENVIO,
  CoberturaNoDisponibleError,
  DireccionNoAutorizadaError,
  EstadoEnvioInvalidoError,
  TransicionEnvioInvalidaError,
};