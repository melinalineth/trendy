import api from "./apiClient";

function listarRoles() {
  return api.get("/roles").then((response) => response.data);
}

function actualizarPermisosRol(id, permisosIds) {
  return api
    .put(`/roles/${id}/permisos`, { permisosIds })
    .then((response) => response.data);
}

const rolService = {
  listarRoles,
  actualizarPermisosRol,
};

export default rolService;
