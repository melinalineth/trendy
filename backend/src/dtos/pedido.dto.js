const { z } = require("zod");
const { ESTADOS_ENVIO } = require("../services/envio.service");
const { HORAS_PREFERENCIA_MAXIMO } = require("../services/pago.service");

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

// Body opcional de POST /api/v1/pedidos/vencidos/cancelar: { horas? }. Mismo
// rango que MERCADOPAGO_PREFERENCIA_HORAS (1 a HORAS_PREFERENCIA_MAXIMO, una
// semana). `horas` es un PISO: el service usa max(horas, vigencia
// configurada), así que un valor menor que la vigencia de las preferencias de
// pago no tiene efecto (no se cancela un pedido que todavía se puede pagar).
const HORAS_MAXIMO = HORAS_PREFERENCIA_MAXIMO;
const cancelarVencidosSchema = z.strictObject(
  {
    horas: z
      .number({ error: "horas debe ser un número entero" })
      .int("horas debe ser un número entero")
      .min(1, "horas debe ser al menos 1")
      .max(HORAS_MAXIMO, `horas no puede superar ${HORAS_MAXIMO}`)
      .optional(),
  },
  { error: errorDeObjeto }
);

// Enum EstadoPedido del schema (ERS §4.2).
const ESTADOS_PEDIDO = Object.freeze([
  "PENDIENTE",
  "PAGO_APROBADO",
  "CONFIRMADO",
  "EN_PREPARACION",
  "ENVIADO",
  "EN_TRANSITO",
  "ENTREGADO",
  "CANCELADO",
  "PAGO_RECHAZADO",
  "PAGO_PENDIENTE",
]);

// Tope de la paginación de GET /api/v1/pedidos.
const LIMITE_MAXIMO = 100;

// Entero positivo que llega como texto en la query (?pagina=2). Un valor
// repetido (?pagina=1&pagina=2) llega como array y también se rechaza.
const enteroEnQuery = (campo, maximo) =>
  z
    .string({ error: `${campo} debe ser un número entero` })
    .regex(/^\d+$/, `${campo} debe ser un número entero mayor que cero`)
    .transform(Number)
    .refine((n) => n >= 1 && n <= maximo, `${campo} debe estar entre 1 y ${maximo}`);

// Fecha calendario AAAA-MM-DD que exista (rechaza 2026-02-30).
function esFechaReal(texto) {
  const [anio, mes, dia] = texto.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
}

const fechaEnQuery = (campo) =>
  z
    .string({ error: `${campo} debe ser una fecha AAAA-MM-DD` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${campo} debe tener el formato AAAA-MM-DD`)
    .refine(esFechaReal, `${campo} no es una fecha válida`);

// Query de GET /api/v1/pedidos (RF-031 / RF-032). `usuarioId` solo lo usa el
// personal: para un cliente el service lo pisa con el de la sesión (RN-003).
// Las fechas se interpretan en America/Bogota en el service.
const listarPedidosSchema = z
  .strictObject(
    {
      estado: z
        .enum(ESTADOS_PEDIDO, { error: `estado debe ser uno de: ${ESTADOS_PEDIDO.join(", ")}` })
        .optional(),
      numero: z
        .string({ error: "numero debe ser un texto" })
        .trim()
        .min(1, "numero no puede estar vacío")
        .max(40, "numero no puede superar 40 caracteres")
        .optional(),
      usuarioId: enteroEnQuery("usuarioId", ID_MAXIMO).optional(),
      desde: fechaEnQuery("desde").optional(),
      hasta: fechaEnQuery("hasta").optional(),
      pagina: enteroEnQuery("pagina", 100000).optional(),
      limite: enteroEnQuery("limite", LIMITE_MAXIMO).optional(),
    },
    {
      error: (issue) =>
        issue.code === "unrecognized_keys"
          ? `Parámetros no permitidos: ${issue.keys.join(", ")}`
          : "Parámetros de consulta inválidos",
    }
  )
  .refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, {
    message: "desde no puede ser posterior a hasta",
    path: ["desde"],
  });

// Body de PATCH /api/v1/pedidos/:id/estado. Que el estado exista es
// validación de entrada (400); que la transición sea válida lo decide el
// service (409 TRANSICION_ESTADO_INVALIDA).
const actualizarEstadoSchema = z.strictObject(
  {
    estado: z.enum(ESTADOS_PEDIDO, {
      error: `estado es obligatorio y debe ser uno de: ${ESTADOS_PEDIDO.join(", ")}`,
    }),
  },
  { error: errorDeObjeto }
);

// Body de PUT /api/v1/pedidos/:id/estado-envio (RF-029).
const actualizarEstadoEnvioSchema = z.strictObject(
  {
    estadoEnvio: z.enum(ESTADOS_ENVIO, {
      error: `estadoEnvio es obligatorio y debe ser uno de: ${ESTADOS_ENVIO.join(", ")}`,
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

// Body de POST /api/v1/pedidos/vencidos/cancelar (puede venir vacío).
function validarCancelarVencidos(body) {
  return validar(cancelarVencidosSchema, body ?? {});
}

// Query de GET /api/v1/pedidos.
function validarListarPedidos(query) {
  return validar(listarPedidosSchema, { ...(query ?? {}) });
}

// Body de PATCH /api/v1/pedidos/:id/estado: { estado }.
function validarActualizarEstado(body) {
  return validar(actualizarEstadoSchema, body ?? {});
}

// Body de PUT /api/v1/pedidos/:id/estado-envio: { estadoEnvio }.
function validarActualizarEstadoEnvio(body) {
  return validar(actualizarEstadoEnvioSchema, body ?? {});
}

module.exports = {
  METODOS_PAGO,
  ESTADOS_PEDIDO,
  LIMITE_MAXIMO,
  crearPedidoSchema,
  cancelarVencidosSchema,
  listarPedidosSchema,
  actualizarEstadoSchema,
  actualizarEstadoEnvioSchema,
  validarCrearPedido,
  validarCancelarVencidos,
  validarListarPedidos,
  validarActualizarEstado,
  validarActualizarEstadoEnvio,
};
