const imagenRepository = require("../repositories/imagen.repository");
const productoRepository = require("../repositories/producto.repository");

class ProductoNoEncontradoError extends Error {}
class ExtensionInvalidaError extends Error {}

const EXTENSIONES_PERMITIDAS = ["jpg", "jpeg", "png", "webp"];

// RF-014: valida la extensión a partir del nombre/URL de archivo recibido.
// No hay upload real de archivos en esta ronda —no está instalado multer
// ni ningún SDK de storage (S3, Cloudinary, etc.) y agregarlo sería scope
// creep no pedido en el DDS/ERS de esta ronda—, así que se asume que el
// archivo YA fue subido a otro storage por fuera de este backend y acá
// solo se persiste la URL resultante (ver decisión de diseño en
// imagen.controller.js). Aun así se valida la extensión para no guardar
// referencias a archivos que claramente no son imágenes.
function validarExtension(url) {
  const match = /\.([a-zA-Z0-9]+)(?:[?#].*)?$/.exec(url ?? "");
  const extension = match?.[1]?.toLowerCase();

  if (!extension || !EXTENSIONES_PERMITIDAS.includes(extension)) {
    throw new ExtensionInvalidaError(
      `La extensión de la imagen debe ser una de: ${EXTENSIONES_PERMITIDAS.join(", ")}`
    );
  }
}

// RF-014: alta de imagen de un producto.
//
// Convención de "imagen principal": el modelo Imagen (fragmento del DDS
// §4.2, ver schema.prisma) no tiene un campo booleano `esPrincipal`, solo
// `orden`. Se usa `orden: 0` como convención de "imagen principal" — la
// primera imagen que se sube a un producto queda en orden 0; las
// siguientes se agregan al final de la lista (orden = cantidad de
// imágenes ya existentes para ese producto). Esta convención NO está
// escrita en el DDS, es una decisión de esta ronda para no modificar el
// schema — si el equipo prefiere un campo booleano explícito, requiere
// tocar el modelo Imagen (fuera de alcance acá).
async function crear(productoId, url) {
  const producto = await productoRepository.obtenerPorId(Number(productoId));
  if (!producto) {
    throw new ProductoNoEncontradoError("El producto no existe");
  }

  validarExtension(url);

  const imagenesExistentes = await imagenRepository.listarPorProducto(Number(productoId));
  const orden = imagenesExistentes.length;

  return imagenRepository.crear(Number(productoId), url, orden);
}

module.exports = {
  crear,
  ProductoNoEncontradoError,
  ExtensionInvalidaError,
};
