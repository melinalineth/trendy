function validarAgregarItem(body) {
  const { varianteId, cantidad } = body || {};

  const errores = [];

  // Variante obligatoria
  if (
    varianteId === undefined ||
    varianteId === null ||
    varianteId === ""
  ) {
    errores.push("varianteId es obligatorio");
  } else if (!Number.isInteger(Number(varianteId)) || Number(varianteId) <= 0) {
    errores.push("varianteId debe ser un entero mayor que cero");
  }

  // Cantidad obligatoria y mayor que cero
  if (
    cantidad === undefined ||
    cantidad === null ||
    cantidad === ""
  ) {
    errores.push("cantidad es obligatoria");
  } else if (!Number.isInteger(Number(cantidad)) || Number(cantidad) <= 0) {
    errores.push("cantidad debe ser un entero mayor que cero");
  }

  if (errores.length > 0) {
    const error = new Error("Datos inválidos");
    error.statusCode = 400;
    error.errores = errores;

    throw error;
  }

  return {
    varianteId: Number(varianteId),
    cantidad: Number(cantidad),
  };
}

module.exports = {
  validarAgregarItem,
};