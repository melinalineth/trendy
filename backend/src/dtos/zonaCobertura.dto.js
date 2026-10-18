// Validación de entrada de la administración de zonas de cobertura y tarifas
// (RF-026). Los validadores lanzan un Error con status 400 / codigo
// VALIDACION_FALLIDA / detalles[] que errorHandler.js formatea como
// { error: { codigo, mensaje, detalles } } (mismo contrato que carrito.dto.js
// y envio.dto.js). `statusCode` y `errores` se conservan por compatibilidad
// con la primera versión de este DTO.

// Tope razonable para un costo de envío y límite de los textos (las columnas
// son VARCHAR(191); se exige menos para no aceptar basura).
const COSTO_MAXIMO = 1000000;
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
// es un número JSON (no string), finito, ENTERO (pesos COP, sin centavos),
// mayor o igual que 1 y por debajo de un tope razonable. Regla "COP en pesos
// enteros" (docs/diseno/montos-cop.md): Mercado Pago solo acepta montos
// enteros en COP. La columna sigue siendo DECIMAL(10, 2).
// "Entero >= 1" cierra por construcción el bypass que antes frenaba un mínimo
// de 0.01: un valor positivo minúsculo (1e-8) pasaba la tolerancia de
// decimales y MySQL lo guardaba como 0.00 (tarifa en cero). Ya no pasa el
// chequeo de entero; se conserva su test de regresión.
function validarCosto(costo, campo, errores) {
  if (costo === undefined || costo === null || costo === "") {
    errores.push(`${campo} es obligatorio`);
    return null;
  }

  if (typeof costo !== "number" || !Number.isFinite(costo) || costo <= 0) {
    errores.push(`${campo} debe ser un número mayor que cero`);
    return null;
  }

  if (!Number.isInteger(costo)) {
    errores.push(`${campo} debe ser un valor entero en pesos (COP), sin centavos`);
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
  const errores = [];

  if (typeof permiteContraEntrega !== "boolean") {
    errores.push("permiteContraEntrega es obligatorio y debe ser true o false");
  }

  // Estricto (como pago.dto.js): un campo de más se rechaza en vez de
  // ignorarse en silencio.
  const extras =
    body && typeof body === "object"
      ? Object.keys(body).filter((clave) => clave !== "permiteContraEntrega")
      : [];
  if (extras.length > 0) {
    errores.push(`Campos no permitidos: ${extras.join(", ")}`);
  }

  if (errores.length > 0) {
    lanzarValidacion(errores);
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
