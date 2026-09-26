import api from "./apiClient";

// Filtra los valores vacíos/undefined antes de armar los query params:
// así "?categoria=&talla=" no llega al backend cuando el usuario todavía
// no eligió un filtro (RF-008 a RF-011).
function limpiarFiltros(filtros = {}) {
  return Object.fromEntries(
    Object.entries(filtros).filter(
      ([, valor]) => valor !== undefined && valor !== null && valor !== "",
    ),
  );
}

function listarProductos(filtros = {}) {
  return api
    .get("/productos", { params: limpiarFiltros(filtros) })
    .then((response) => response.data);
}

function listarCategorias() {
  return api.get("/categorias").then((response) => response.data);
}

// Detalle de producto público (RF-012). El backend devuelve 404 cuando el
// producto no existe o no está activo; se propaga tal cual para que la
// página de detalle distinga ese caso de un error genérico de red.
function obtenerProducto(id) {
  return api.get(`/productos/${id}`).then((response) => response.data);
}

// Alta de producto (RF-013). El contrato NO acepta `estado` en el body: el
// backend lo asigna en ACTIVO por defecto (ver schema.prisma, modelo
// Producto). El estado se cambia después con cambiarEstadoProducto.
function crearProducto(datos) {
  return api.post("/productos", datos).then((response) => response.data);
}

// Edición de producto (RF-013). Mismo body que crearProducto; tampoco acepta
// `estado` acá.
function actualizarProducto(id, datos) {
  return api.put(`/productos/${id}`, datos).then((response) => response.data);
}

// Único endpoint del contrato que cambia el estado de un producto ya
// existente (RF-013/RF-014).
function cambiarEstadoProducto(id, estado) {
  return api
    .patch(`/productos/${id}/estado`, { estado })
    .then((response) => response.data);
}

// Carga de imágenes (RF-014). El backend todavía no sube archivos: espera
// una URL de una imagen ya alojada en un storage externo (ver
// UploaderImagenes.jsx para el detalle de esta limitación del MVP).
function subirImagen(productoId, url) {
  return api
    .post(`/productos/${productoId}/imagenes`, { url })
    .then((response) => response.data);
}

const productoService = {
  listarProductos,
  listarCategorias,
  obtenerProducto,
  crearProducto,
  actualizarProducto,
  cambiarEstadoProducto,
  subirImagen,
};

export default productoService;
