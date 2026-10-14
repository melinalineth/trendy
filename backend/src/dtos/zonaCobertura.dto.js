// Validación de entrada de la administración de zonas de cobertura y tarifas
// (RF-026). Los validadores lanzan un Error con status 400 / codigo
// VALIDACION_FALLIDA / detalles[] que errorHandler.js formatea como
// { error: { codigo, mensaje, detalles } } (mismo contrato que carrito.dto.js
// y envio.dto.js). `statusCode` y `errores` se conservan por compatibilidad
// con la primera versión de este DTO.

// Tope razonable para un costo de envío y límite de los textos (las columnas
// son VARCHAR(191); se exige menos para no aceptar basura).
const COSTO_MAXIMO = 1000000;
// Unidad mínima de DECIMAL(10, 2): por debajo, MySQL redondearía a 0.00 y la
// tarifa quedaría en cero aunque el valor enviado fuera "mayor que cero".
const COSTO_MINIMO = 0.01;
const LARGO_MAXIMO_TEXTO = 100;
const ID_MAXIMO = 2147483647; // INT de MySQL

const ESTADOS_VALIDOS = ["ACTIVO", "INACTIVO"];

function lanzarValidacion(errores) {
  const error = new Error("Datos inválidos");
  error.status = 400;
  error.statusCode = 400;
  error.codigo = "VALIDACION_FALLIDA";
  error.errores = errores;
  error.detalles = errores;

  throw error;
}

// Valida un campo de texto obligatorio; agrega el problema a `errores` y
// devuelve el valor recortado (o null si no es válido).
function validarTexto(valor, campo, obligatorio, errores) {
  if (typeof valor !== "string" || !valor.trim()) {
    errores.push(`${campo} es ${obligatorio}`);
    return null;
  }

  if (valor.trim().length > LARGO_MAXIMO_TEXTO) {
    errores.push(`${campo} no puede superar los ${LARGO_MAXIMO_TEXTO} caracteres`);
    return null;
  }

  return valor.trim();
}

// RF-026 "no se permitirá activar una tarifa con valores inválidos": el costo
// es un número JSON (no string), finito, mayor que cero, con hasta 2 decimales
// (la columna es DECIMAL(10, 2)) y por debajo de un tope razonable.
function validarCosto(costo, campo, errores) {
  if (costo === undefined || costo === null || costo === "") {
    errores.push(`${campo} es obligatorio`);
    return null;
  }

  if (typeof costo !== "number" || !Number.isFinite(costo) || costo <= 0) {
    errores.push(`${campo} debe ser un número mayor que cero`);
    return null;
  }

  if (costo < COSTO_MINIMO) {
    errores.push(`${campo} debe ser como mínimo ${COSTO_MINIMO}`);
    return null;
  }

  if (Math.abs(Math.round(costo * 100) - costo * 100) > 1e-6) {
    errores.push(`${campo} admite como máximo 2 decimales`);
    return null;
  }

  if (costo > COSTO_MAXIMO) {
    errores.push(`${campo} no puede superar ${COSTO_MAXIMO}`);
    return null;
  }

  return costo;
}

function validarCrearZonaCobertura(body) {
  const { nombre, departamento, ciudad, tarifa } = body || {};

  const errores = [];

  const nombreValido = validarTexto(nombre, "nombre", "obligatorio", errores);
  const departamentoValido = validarTexto(departamento, "departamento", "obligatorio", errores);
  const ciudadValida = validarTexto(ciudad, "ciudad", "obligatoria", errores);

  let costo = null;
  if (!tarifa || typeof tarifa !== "object" || Array.isArray(tarifa)) {
    errores.push("tarifa es obligatoria");
  } else {
    costo = validarCosto(tarifa.costo, "tarifa.costo", errores);
  }

  if (errores.length > 0) {
    lanzarValidacion(errores);
  }

  return {
    nombre: nombreValido,
    departamento: departamentoValido,
    ciudad: ciudadValida,
    tarifa: { costo },
  };
}

// Body de PUT /zonas-cobertura/:id/tarifa: { costo }.
function validarCambiarTarifa(body) {
  const errores = [];
  const costo = validarCosto((body || {}).costo, "costo", errores);

  if (errores.length > 0) {
    lanzarValidacion(errores);
  }

  return { costo };
}

// Body de PATCH /zonas-cobertura/:id/estado: { estado: "ACTIVO" | "INACTIVO" }
// (el enum EstadoProducto del schema, en mayúsculas).
function validarCambiarEstado(body) {
  const { estado } = body || {};

  if (!ESTADOS_VALIDOS.includes(estado)) {
    lanzarValidacion([`estado debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}`]);
  }

  return { estado };
}

// Body de PATCH /zonas-cobertura/:id/contra-entrega (RF-037, RN-006):
// { permiteContraEntrega: true | false }. Boolean JSON estricto: "true" o 1
// no se aceptan, para no habilitar un método de pago por una conversión
// implícita.
function validarCambiarContraEntrega(body) {
  const { permiteContraEntrega } = body || {};

  if (typeof permiteContraEntrega !== "boolean") {
    lanzarValidacion(["permiteContraEntrega es obligatorio y debe ser true o false"]);
  }

  return { permiteContraEntrega };
}

// Param :id de las rutas /zonas-cobertura/:id/...; devuelve un Number.
function validarZonaId(valor) {
  const texto = typeof valor === "string" ? valor.trim() : "";

  if (!/^\d+$/.test(texto) || Number(texto) <= 0 || Number(texto) > ID_MAXIMO) {
    lanzarValidacion(["id de zona debe ser un entero mayor que cero"]);
  }

  return Number(texto);
}

module.exports = {
  validarCrearZonaCobertura,
  validarCambiarTarifa,
  validarCambiarEstado,
  validarCambiarContraEntrega,
  validarZonaId,
};
