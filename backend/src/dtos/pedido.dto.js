const { z } = require("zod");

// Sprint 4 / MOD-06 (DDS §3): validación de entrada de los endpoints de
// pedidos. Los validadores lanzan un Error con status 400 / codigo
// VALIDACION_FALLIDA / detalles[] que errorHandler.js formatea como
// { error: { codigo, mensaje, detalles } } (DDS §5.3; mismo contrato que
// pago.dto.js y zonaCobertura.dto.js).

const ID_MAXIMO = 2147483647; // INT de MySQL

// Enum MetodoPago del schema.
const METODOS_PAGO = Object.freeze(["MERCADO_PAGO", "CONTRA_ENTREGA"]);

// Mensaje para un body que no es objeto o trae claves de más (`strict`).
const errorDeObjeto = (issue) =>
  issue.code === "unrecognized_keys"
    ? `Campos no permitidos: ${issue.keys.join(", ")}`
    : "El body debe ser un objeto JSON";

// RF-030: el pedido NO recibe líneas ni montos en el body: las líneas salen
// del carrito del usuario autenticado y los montos se calculan en el servidor
// con los precios vigentes. `strict` rechaza campos de más (p. ej. un
// "total" o "items" enviado por el cliente).
const crearPedidoSchema = z.strictObject(
  {
    direccionId: z
      .number({ error: "direccionId es obligatorio y debe ser un número entero" })
      .int("direccionId debe ser un número entero")
      .positive("direccionId debe ser mayor que cero")
      .max(ID_MAXIMO, `direccionId no puede superar ${ID_MAXIMO}`),
    metodoPago: z.enum(METODOS_PAGO, {
      error: `metodoPago es obligatorio y debe ser uno de: ${METODOS_PAGO.join(", ")}`,
    }),
  },
  { error: errorDeObjeto }
);

function lanzarValidacion(errores) {
  const error = new Error("Datos inválidos");
  error.status = 400;
  error.statusCode = 400;
  error.codigo = "VALIDACION_FALLIDA";
  error.errores = errores;
  error.detalles = errores;

  throw error;
}

function validar(schema, datos) {
  const parseo = schema.safeParse(datos);

  if (!parseo.success) {
    lanzarValidacion(parseo.error.issues.map((issue) => issue.message));
  }

  return parseo.data;
}

// Body de POST /api/v1/pedidos: { direccionId, metodoPago }.
function validarCrearPedido(body) {
  return validar(crearPedidoSchema, body ?? {});
}

module.exports = {
  METODOS_PAGO,
  crearPedidoSchema,
  validarCrearPedido,
};
