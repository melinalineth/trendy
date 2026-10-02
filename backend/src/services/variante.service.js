const varianteRepository = require("../repositories/variante.repository");
const productoRepository = require("../repositories/producto.repository");

class ProductoNoEncontradoError extends Error {}
class VarianteDuplicadaError extends Error {}

// RF-016: capa fina entre controller y repository — la única lógica no
// trivial acá es traducir el P2002 de Prisma (constraint unique violado) a
// un 409 legible. Dos constraints distintas pueden dispararlo (ver
// modelo Variante en schema.prisma):
//   - Variante.sku (@unique): SKU repetido entre CUALQUIER par de variantes.
//   - @@unique([productoId, talla, color]): esa combinación talla+color ya
//     existe para ESE producto (con otro SKU).
// Prisma expone en error.meta.target qué columnas participaron del índice
// violado, así que se inspecciona para devolver un mensaje específico en
// vez de un "conflicto genérico".
async function crear(productoId, datos) {
  const producto = await productoRepository.obtenerPorId(Number(productoId));
  if (!producto) {
    throw new ProductoNoEncontradoError("El producto no existe");
  }

  try {
    return await varianteRepository.crear(Number(productoId), datos);
  } catch (error) {
    if (error.code === "P2002") {
      const target = error.meta?.target ?? [];
      const targetStr = Array.isArray(target) ? target.join(",") : String(target);

      if (targetStr.includes("sku")) {
        throw new VarianteDuplicadaError("Ya existe una variante con ese SKU");
      }

      throw new VarianteDuplicadaError(
        "Ya existe una variante con esa combinación de talla y color para este producto"
      );
    }

    throw error;
  }
}

module.exports = {
  crear,
  ProductoNoEncontradoError,
  VarianteDuplicadaError,
};
