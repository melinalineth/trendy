const productoRepository = require("../repositories/producto.repository");
const imagenRepository = require("../repositories/imagen.repository");

class ProductoNoEncontradoError extends Error {}
class ProductoSinImagenError extends Error {}

// RF-008/RF-009/RF-010/RF-011: el grueso de la lógica (RN-001 de estado y
// stock, filtros combinables por categoría/talla/precio/búsqueda de texto)
// ya vive en productoRepository.buscar (Sprint 2, escrito por una
// compañera de equipo) — este service es la capa fina de siempre entre
// controller y repository, sin transformación adicional porque el shape
// que devuelve Prisma (producto + categoria + variantes + imagenes) ya es
// el que necesita el front del catálogo.
async function buscar(filtros) {
  return productoRepository.buscar(filtros);
}

// RF-012: detalle de producto (MOD-02). Devuelve `null` cuando el producto
// no existe o no está ACTIVO (RN-001) — es una señal de dominio, no un
// error; el controller la traduce a 404. Por cada variante se calcula
// `disponible` a partir del stock (no se filtran las variantes agotadas:
// el detalle necesita poder mostrarlas como "sin stock").
async function obtenerDetallePorId(id) {
  const producto = await productoRepository.obtenerPorId(Number(id));

  if (!producto || producto.estado !== "ACTIVO") {
    return null;
  }

  return {
    ...producto,
    variantes: producto.variantes.map((variante) => ({
      ...variante,
      disponible: variante.stock > 0,
    })),
  };
}

// RF-013: precio > 0. El DTO (crearProductoSchema/actualizarProductoSchema
// en producto.dto.js) ya lo valida con zod antes de llegar acá — este
// chequeo es defensa en profundidad, por si en el futuro algún otro caller
// invoca el service sin pasar por el DTO (mismo criterio que
// vendedor.service, que revalida el estado del usuario objetivo aunque el
// controller ya haya filtrado casos obvios).
function validarPrecio(precio) {
  if (precio !== undefined && !(precio > 0)) {
    throw new Error("El precio debe ser mayor a 0");
  }
}

// RF-013: alta de producto por admin/vendedor.
//
// `vendedorId` se recibe pero HOY NO SE PERSISTE: el modelo Producto
// (fragmento textual del DDS §4.2, ver schema.prisma) no tiene un campo
// `vendedorId` — no hay forma de asociar un producto a su vendedor dueño a
// nivel de datos todavía. Limitación conocida (DDS §6.2, ya señalada en
// roleGuard.js): un vendedor puede crear/editar/cambiar el estado de
// CUALQUIER producto, no solo los suyos, hasta que el equipo decida
// agregar ese campo al schema (fuera de alcance de esta ronda: el schema
// sigue el fragmento del DDS sin modificar). Se deja el parámetro
// documentado acá para que, el día que el campo exista, alcance con
// persistirlo sin tener que tocar la firma del controller ni de las rutas.
async function crear(datos, vendedorId) {
  validarPrecio(datos.precio);
  return productoRepository.crear(datos);
}

// RF-013: edición parcial. Mismo límite de `vendedorId` que `crear` — no
// hay forma de restringir "solo tus productos" sin el campo en el schema.
async function actualizar(id, datos) {
  const producto = await productoRepository.obtenerPorId(Number(id));
  if (!producto) {
    throw new ProductoNoEncontradoError("El producto no existe");
  }

  validarPrecio(datos.precio);
  return productoRepository.actualizar(Number(id), datos);
}

// RF-013 (RN): un producto no puede pasar a ACTIVO sin al menos una imagen
// — evita que el catálogo público (RF-008 a RF-011) muestre productos sin
// foto. La regla solo aplica al (re)activar; desactivar (INACTIVO) nunca
// requiere imágenes. Se decidió validar acá (service), no en el
// controller, para que la regla de negocio quede en una sola capa
// reutilizable sin importar quién la invoque.
async function cambiarEstado(id, estado) {
  const producto = await productoRepository.obtenerPorId(Number(id));
  if (!producto) {
    throw new ProductoNoEncontradoError("El producto no existe");
  }

  if (estado === "ACTIVO") {
    const imagenes = await imagenRepository.listarPorProducto(Number(id));
    if (imagenes.length === 0) {
      throw new ProductoSinImagenError(
        "El producto necesita al menos una imagen para poder activarse"
      );
    }
  }

  return productoRepository.cambiarEstado(Number(id), estado);
}

module.exports = {
  buscar,
  obtenerDetallePorId,
  crear,
  actualizar,
  cambiarEstado,
  ProductoNoEncontradoError,
  ProductoSinImagenError,
};
