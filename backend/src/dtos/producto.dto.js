const { z } = require("zod");

// RF-013: alta y edición de productos por admin/vendedor. RN (RF-013): el
// precio debe ser estrictamente positivo — se valida acá con zod y se
// refuerza en producto.service (defensa en profundidad, mismo criterio que
// vendedor.service revalidando el estado aunque el controller ya filtró
// casos obvios).
// Regla "COP en pesos enteros" (docs/diseno/montos-cop.md): el precio además
// es ENTERO (sin centavos), porque Mercado Pago solo acepta montos enteros en
// COP. La columna sigue siendo DECIMAL(10, 2).
const MENSAJE_PRECIO_ENTERO = "El precio debe ser un valor entero en pesos (COP), sin centavos";

// Tope: la columna es DECIMAL(10, 2), que admite hasta 99.999.999,99; el
// máximo entero es 99.999.999. Sin tope, un 1e10 reventaría en MySQL (500) y un
// 1e21 se reportaría como "no entero" (zod 4 solo acepta enteros seguros).
const PRECIO_MAXIMO = 99999999;
const MENSAJE_PRECIO_MAXIMO = `El precio no puede superar ${PRECIO_MAXIMO} (COP)`;

// `abort: true` en el máximo: un valor fuera de rango informa SOLO el tope y no
// además el motivo de entero/positivo. Va primero por eso.
const precioNumero = (opciones) =>
  z
    .number(opciones)
    .max(PRECIO_MAXIMO, { error: MENSAJE_PRECIO_MAXIMO, abort: true })
    .int(MENSAJE_PRECIO_ENTERO)
    .positive("El precio debe ser mayor a 0");

const crearProductoSchema = z.object({
  nombre: z
    .string({ error: "El nombre es requerido" })
    .trim()
    .min(1, "El nombre es requerido"),
  descripcion: z
    .string({ error: "La descripción es requerida" })
    .trim()
    .min(1, "La descripción es requerida"),
  precio: precioNumero({ error: "El precio es requerido" }),
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
  precio: precioNumero().optional(),
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
  PRECIO_MAXIMO,
  MENSAJE_PRECIO_ENTERO,
  MENSAJE_PRECIO_MAXIMO,
  crearProductoSchema,
  actualizarProductoSchema,
  cambiarEstadoSchema,
};
