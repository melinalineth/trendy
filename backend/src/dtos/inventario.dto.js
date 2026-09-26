const { z } = require("zod");

// RF-017: registro y ajuste de stock por variante (MOD-03). `cantidad` es el
// delta a aplicar sobre Variante.stock (positivo o negativo, nunca 0 — un
// ajuste de cantidad 0 no representa ningún movimiento real). La regla de
// que el stock resultante no puede quedar negativo (RN-002) NO se valida
// acá porque depende del stock actual de la variante en base — eso vive en
// inventario.repository.registrarAjuste, dentro de la misma transacción que
// lee el stock.
//
// `motivo` es opcional en general, pero se exige con `.refine()` cuando
// `tipoAjuste === "AJUSTE"`: una ENTRADA (recepción de mercadería) o SALIDA
// (venta/despacho) se explican solas por el tipo, pero un AJUSTE manual
// (ej: corrección por conteo físico, producto dañado) necesita
// justificarse para poder auditar por qué se movió el stock fuera del
// flujo normal de venta/reposición.
const crearAjusteSchema = z
  .object({
    varianteId: z
      .number({ error: "La variante es requerida" })
      .int("La variante es inválida"),
    cantidad: z
      .number({ error: "La cantidad es requerida" })
      .int("La cantidad debe ser un número entero")
      .refine((valor) => valor !== 0, "La cantidad no puede ser 0"),
    tipoAjuste: z.enum(["ENTRADA", "SALIDA", "AJUSTE"], {
      error: "El tipo de ajuste debe ser ENTRADA, SALIDA o AJUSTE",
    }),
    motivo: z.string().trim().min(1, "El motivo no puede estar vacío").optional(),
  })
  .refine(
    (datos) => datos.tipoAjuste !== "AJUSTE" || Boolean(datos.motivo),
    {
      message: "El motivo es requerido cuando el tipo de ajuste es AJUSTE",
      path: ["motivo"],
    }
  );

module.exports = {
  crearAjusteSchema,
};
