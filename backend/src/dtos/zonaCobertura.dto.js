function validarCrearZonaCobertura(body) {
  const {
    nombre,
    departamento,
    ciudad,
    tarifa,
  } = body || {};

  const errores = [];

  // Nombre
  if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
    errores.push("nombre es obligatorio");
  }

  // Departamento
  if (
    !departamento ||
    typeof departamento !== "string" ||
    !departamento.trim()
  ) {
    errores.push("departamento es obligatorio");
  }

  // Ciudad
  if (!ciudad || typeof ciudad !== "string" || !ciudad.trim()) {
    errores.push("ciudad es obligatoria");
  }

  // Tarifa
  if (!tarifa || typeof tarifa !== "object") {
    errores.push("tarifa es obligatoria");
  } else {
    const { costo } = tarifa;

    if (
      costo === undefined ||
      costo === null ||
      costo === ""
    ) {
      errores.push("tarifa.costo es obligatorio");
    } else if (
      typeof costo !== "number" ||
      !Number.isFinite(costo) ||
      costo <= 0
    ) {
      errores.push("tarifa.costo debe ser un número mayor que cero");
    }
  }

  if (errores.length > 0) {
    const error = new Error("Datos inválidos");
    error.statusCode = 400;
    error.errores = errores;
    throw error;
  }

  return {
    nombre: nombre.trim(),
    departamento: departamento.trim(),
    ciudad: ciudad.trim(),
    tarifa: {
      costo: tarifa.costo,
    },
  };
}

module.exports = {
  validarCrearZonaCobertura,
};