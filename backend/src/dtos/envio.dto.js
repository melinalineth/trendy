// Valida el query param `direccionId` de GET /api/v1/envios/tarifa
// (obligatorio) y de GET /api/v1/carrito/resumen (opcional). Mismo contrato de
// error que carrito.dto.js: lanza un Error con status 400 que errorHandler.js
// formatea como { error: { codigo, mensaje, detalles } }.
//
// Devuelve el id como Number, o null si es opcional y no vino.
function validarDireccionId(valor, { obligatorio = true } = {}) {
  const vacio = valor === undefined || valor === null || valor === "";

  if (vacio && !obligatorio) {
    return null;
  }

  let mensaje = null;

  if (vacio) {
    mensaje = "direccionId es obligatorio";
  } else if (typeof valor !== "string" || !/^\d+$/.test(valor.trim()) || Number(valor) <= 0) {
    mensaje = "direccionId debe ser un entero mayor que cero";
  }

  if (mensaje) {
    const error = new Error("Datos inválidos");
    error.status = 400;
    error.statusCode = 400;
    error.codigo = "VALIDACION_FALLIDA";
    error.errores = [mensaje];
    error.detalles = error.errores;

    throw error;
  }

  return Number(valor);
}

module.exports = {
  validarDireccionId,
};
