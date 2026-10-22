const { z } = require("zod");

// RF-005 (ERS): la dirección incluye los campos requeridos para poder
// entregar un pedido. codigoPostal/referencia son complementarios y no
// bloquean la entrega si faltan.
//
// Nota zod v4: el mensaje de `.min(1, "...")` solo aplica cuando el campo
// SÍ llega como string (ej: ""), no cuando falta directamente del body —
// en ese caso zod tira su propio "Invalid input: expected string, received
// undefined" antes de llegar al .min(). Por eso acá también se pasa el
// mensaje en `z.string({ error: "..." })`, que cubre el caso de tipo
// inválido/undefined. Con eso, faltante o vacío devuelven el mismo mensaje
// claro. (auth.dto.js aplica el mismo patrón.)
const crearDireccionSchema = z.object({
  destinatario: z
    .string({ error: "El destinatario es requerido" })
    .trim()
    .min(1, "El destinatario es requerido"),
  telefono: z
    .string({ error: "El teléfono es requerido" })
    .trim()
    .min(1, "El teléfono es requerido"),
  calle: z
    .string({ error: "La calle es requerida" })
    .trim()
    .min(1, "La calle es requerida"),
  ciudad: z
    .string({ error: "La ciudad es requerida" })
    .trim()
    .min(1, "La ciudad es requerida"),
  departamento: z
    .string({ error: "El departamento es requerido" })
    .trim()
    .min(1, "El departamento es requerido"),
  codigoPostal: z.string().trim().optional(),
  referencia: z.string().trim().optional(),
  esPrincipal: z.boolean().optional(),
});

// PUT /direcciones/:id REEMPLAZA los datos de la dirección: mismos campos y
// mismas validaciones que el alta (los opcionales que no vienen quedan sin
// valor; `esPrincipal` ausente conserva el que tenía).
const actualizarDireccionSchema = crearDireccionSchema;

// PATCH /direcciones/:id: cambia SOLO el flag de principal. Estricto: cualquier
// otro campo es un error (no se aplica nada a medias).
const principalDireccionSchema = z.strictObject(
  {
    esPrincipal: z.boolean({ error: "esPrincipal es requerido y debe ser true o false" }),
  },
  { error: "El cuerpo solo admite el campo esPrincipal" }
);

// Mismo contrato de error que el resto de los DTOs (carrito, envío, pedidos):
// un Error con status 400 que errorHandler.js formatea como
// { error: { codigo, mensaje, detalles } } (DDS §5.3).
function errorDeValidacion(detalles) {
  const error = new Error("Datos inválidos");
  error.status = 400;
  error.codigo = "VALIDACION_FALLIDA";
  error.detalles = detalles;
  return error;
}

// Valida el body de alta/modificación y devuelve los datos limpios (trim).
function validarCuerpoDireccion(body, schema = crearDireccionSchema) {
  const parseo = schema.safeParse(body ?? {});

  if (!parseo.success) {
    throw errorDeValidacion(parseo.error.issues.map((issue) => issue.message));
  }

  return parseo.data;
}

// Valida el :id de la ruta (entero positivo) y lo devuelve como Number.
function validarIdDireccion(valor) {
  const texto = typeof valor === "string" ? valor.trim() : "";

  if (!/^\d+$/.test(texto) || !Number.isSafeInteger(Number(texto)) || Number(texto) <= 0) {
    throw errorDeValidacion(["El id de la dirección debe ser un entero mayor que cero"]);
  }

  return Number(texto);
}

module.exports = {
  crearDireccionSchema,
  actualizarDireccionSchema,
  principalDireccionSchema,
  validarCuerpoDireccion,
  validarIdDireccion,
};
