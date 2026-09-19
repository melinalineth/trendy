import api from "./apiClient";

function listarDirecciones() {
  return api.get("/direcciones").then((response) => response.data);
}

function crearDireccion(datos) {
  return api.post("/direcciones", datos).then((response) => response.data);
}

const direccionService = {
  listarDirecciones,
  crearDireccion,
};

export default direccionService;
