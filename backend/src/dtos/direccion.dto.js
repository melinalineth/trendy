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

module.exports = {
  crearDireccionSchema,
};
