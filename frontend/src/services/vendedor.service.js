import api from "./apiClient";

function cambiarEstadoVendedor(id, estado) {
  return api
    .put(`/vendedores/${id}/estado`, { estado })
    .then((response) => response.data);
}

const vendedorService = {
  cambiarEstadoVendedor,
};

export default vendedorService;
