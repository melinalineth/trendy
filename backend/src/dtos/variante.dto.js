const { z } = require("zod");

// RF-016: alta de variantes (talla/color/SKU/stock) de un producto. La
// unicidad del SKU y de la combinación [productoId, talla, color] vive a
// nivel de schema (@unique / @@unique en Variante) — acá solo se valida
// forma/tipo; la duplicación se traduce a un 409 en variante.service
// capturando el P2002 que dispara Prisma.
const crearVarianteSchema = z.object({
  sku: z
    .string({ error: "El SKU es requerido" })
    .trim()
    .min(1, "El SKU es requerido"),
  talla: z
    .string({ error: "La talla es requerida" })
    .trim()
    .min(1, "La talla es requerida"),
  color: z.string().trim().optional(),
  stock: z
    .number({ error: "El stock es requerido" })
    .int("El stock debe ser un número entero")
    .min(0, "El stock no puede ser negativo"),
});

module.exports = {
  crearVarianteSchema,
};
