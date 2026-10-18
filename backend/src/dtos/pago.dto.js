const { z } = require("zod");

// Sprint 4 / MOD-07 (DDS §3): validación de entrada de los endpoints de pagos.
// Los validadores lanzan un Error con status 400 / codigo VALIDACION_FALLIDA /
// detalles[] que errorHandler.js formatea como
// { error: { codigo, mensaje, detalles } } (DDS §5.3; mismo contrato que
// zonaCobertura.dto.js y envio.dto.js).

const ID_MAXIMO = 2147483647; // INT de MySQL

// pedidoId como número JSON entero > 0 dentro de Int32 (las columnas son INT).
// Zod v4: el mensaje de `z.number({ error })` cubre también el campo ausente.
const pedidoIdSchema = z
  .number({ error: "pedidoId es obligatorio y debe ser un número entero" })
  .int("pedidoId debe ser un número entero")
  .positive("pedidoId debe ser mayor que cero")
  .max(ID_MAXIMO, `pedidoId no puede superar ${ID_MAXIMO}`);

// RF-034: el body de la preferencia trae SOLO el pedido; el monto y las
// líneas se arman en el servidor a partir del pedido real, nunca de lo que
// mande el cliente. `strict` rechaza campos de más (p. ej. un "monto").
const preferenciaMercadoPagoSchema = z.strictObject(
  { pedidoId: pedidoIdSchema },
  {
    error: (issue) =>
      issue.code === "unrecognized_keys"
        ? `Campos no permitidos: ${issue.keys.join(", ")}`
        : "El body debe ser un objeto JSON",
  }
);

// RF-037: { pedidoId } del pedido a pagar contra entrega.
const pagoContraEntregaSchema = preferenciaMercadoPagoSchema;

// RF-036: notificación de Mercado Pago. Solo se exige lo que se usa: `type` y,
// para pagos, `data.id` (el id del pago, que además entra en la firma). El
// resto de los campos que manda Mercado Pago (action, api_version,
// live_mode...) se aceptan sin validar.
const webhookMercadoPagoSchema = z
  .object(
    {
      type: z
        .string({ error: "type es obligatorio" })
        .trim()
        .min(1, "type es obligatorio"),
      data: z
        .object(
          {
            id: z.union([z.string().trim().min(1, "data.id no puede estar vacío"), z.number()], {
              error: "data.id debe ser un string o número no vacío",
            }),
          },
          { error: "data debe ser un objeto" }
        )
        .optional(),
    },
    { error: "El body debe ser un objeto JSON" }
  )
  .superRefine((payload, ctx) => {
    if (payload.type === "payment" && payload.data?.id === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["data", "id"],
        message: "data.id es obligatorio en una notificación de pago",
      });
    }
  });

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

// Body de POST /api/v1/pagos/mercadopago/preferencia: { pedidoId }.
function validarPreferenciaMercadoPago(body) {
  return validar(preferenciaMercadoPagoSchema, body ?? {});
}

// Body de POST /api/v1/pagos/contra-entrega: { pedidoId }.
function validarPagoContraEntrega(body) {
  return validar(pagoContraEntregaSchema, body ?? {});
}

// Body de POST /api/v1/pagos/mercadopago/webhook. Devuelve el payload
// normalizado con data.id como string (así entra en la firma).
function validarWebhookMercadoPago(body) {
  const payload = validar(webhookMercadoPagoSchema, body ?? {});

  return payload.data
    ? { ...payload, data: { ...payload.data, id: String(payload.data.id) } }
    : payload;
}

// Param :id / :pedidoId de las rutas; devuelve un Number.
function validarPedidoIdParam(valor) {
  const texto = typeof valor === "string" ? valor.trim() : "";

  if (!/^\d+$/.test(texto) || Number(texto) <= 0 || Number(texto) > ID_MAXIMO) {
    lanzarValidacion(["El id del pedido debe ser un entero mayor que cero"]);
  }

  return Number(texto);
}

module.exports = {
  preferenciaMercadoPagoSchema,
  pagoContraEntregaSchema,
  webhookMercadoPagoSchema,
  validarPreferenciaMercadoPago,
  validarPagoContraEntrega,
  validarWebhookMercadoPago,
  validarPedidoIdParam,
};
