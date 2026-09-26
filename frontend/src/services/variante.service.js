import api from "./apiClient";

// Alta de variante (RF-016). El backend responde 409 cuando `sku` ya existe
// (unique global, ver schema.prisma modelo Variante) o cuando la combinación
// talla/color ya existe para ese producto (@@unique([productoId, talla,
// color])) — el mensaje de error ya distingue cuál de los dos casos fue.
function crearVariante(productoId, datos) {
  return api
    .post(`/productos/${productoId}/variantes`, datos)
    .then((response) => response.data);
}

const varianteService = {
  crearVariante,
};

export default varianteService;
