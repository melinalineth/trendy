import api from "./apiClient";

function listarUsuarios() {
  return api.get("/usuarios").then((response) => response.data);
}

function cambiarEstadoUsuario(id, estado) {
  return api
    .patch(`/usuarios/${id}/estado`, { estado })
    .then((response) => response.data);
}

const usuarioService = {
  listarUsuarios,
  cambiarEstadoUsuario,
};

export default usuarioService;
