const { z } = require("zod");

// RF-013: alta y edición de productos por admin/vendedor. RN (RF-013): el
// precio debe ser estrictamente positivo — se valida acá con zod y se
// refuerza en producto.service (defensa en profundidad, mismo criterio que
// vendedor.service revalidando el estado aunque el controller ya filtró
// casos obvios).
const crearProductoSchema = z.object({
  nombre: z
    .string({ error: "El nombre es requerido" })
    .trim()
    .min(1, "El nombre es requerido"),
  descripcion: z
    .string({ error: "La descripción es requerida" })
    .trim()
    .min(1, "La descripción es requerida"),
  precio: z
    .number({ error: "El precio es requerido" })
    .positive("El precio debe ser mayor a 0"),
  categoriaId: z
    .number({ error: "La categoría es requerida" })
    .int("La categoría es inválida"),
});

// Mismos campos que crear, todos opcionales: PUT parcial, no todos los
// campos tienen que venir en cada actualización.
const actualizarProductoSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre no puede estar vacío").optional(),
  descripcion: z
    .string()
    .trim()
    .min(1, "La descripción no puede estar vacía")
    .optional(),
  precio: z.number().positive("El precio debe ser mayor a 0").optional(),
  categoriaId: z.number().int("La categoría es inválida").optional(),
});

// RF-013: el estado de un producto es el mismo enum EstadoProducto del
// schema (ACTIVO/INACTIVO) — mismo patrón que cambiarEstadoSchema de
// vendedor.dto.js para EstadoUsuario.
const cambiarEstadoSchema = z.object({
  estado: z.enum(["ACTIVO", "INACTIVO"], {
    error: "El estado debe ser ACTIVO o INACTIVO",
  }),
});

module.exports = {
  crearProductoSchema,
  actualizarProductoSchema,
  cambiarEstadoSchema,
};
