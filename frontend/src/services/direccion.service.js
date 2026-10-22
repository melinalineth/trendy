import api from "./apiClient";

function listarDirecciones() {
  return api.get("/direcciones").then((response) => response.data);
}

function crearDireccion(datos) {
  return api.post("/direcciones", datos).then((response) => response.data);
}

// PUT reemplaza los datos de la dirección. Devuelve la dirección vigente: si
// la original tenía pedidos y cambiaron los datos de entrega, su `id` es otro.
function actualizarDireccion(id, datos) {
  return api
    .put(`/direcciones/${id}`, datos)
    .then((response) => response.data);
}

// PATCH cambia SOLO el flag de principal (no manda ni pisa los datos de entrega).
function marcarPrincipal(id) {
  return api
    .patch(`/direcciones/${id}`, { esPrincipal: true })
    .then((response) => response.data);
}

// DELETE responde 204 sin cuerpo.
function eliminarDireccion(id) {
  return api.delete(`/direcciones/${id}`).then(() => undefined);
}

const direccionService = {
  listarDirecciones,
  crearDireccion,
  actualizarDireccion,
  marcarPrincipal,
  eliminarDireccion,
};

export default direccionService;
