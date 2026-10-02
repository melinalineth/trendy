import api from "./apiClient";

// Panel de inventario (RF-017). Requiere sesión admin/vendedor (mismo par de
// roles que el panel de productos) para las tres operaciones de este
// servicio.

// Listado plano de variantes con su stock actual. El backend no pagina ni
// filtra este endpoint todavía; el filtro por texto (nombre/SKU) del panel
// se resuelve en el cliente, igual que en ProductsPanel/useProductosGestion.
function listarInventario() {
  return api.get("/inventario").then((response) => response.data);
}

// Alta de un movimiento de stock (entrada, salida o ajuste manual). El
// backend responde 409 cuando el movimiento dejaría el stock en negativo;
// ese caso se maneja en el componente que llama a este servicio
// (FormularioAjusteStock), no acá, para poder mostrar el mensaje en el
// formulario en vez de perderlo en la promesa rechazada.
function registrarAjuste(datos) {
  return api.post("/inventario/ajustes", datos).then((response) => response.data);
}

// Historial de movimientos de una variante puntual (para el modal "Ver
// historial" de InventarioPanel).
function obtenerHistorial(varianteId) {
  return api
    .get(`/inventario/${varianteId}/historial`)
    .then((response) => response.data);
}

const inventarioService = {
  listarInventario,
  registrarAjuste,
  obtenerHistorial,
};

export default inventarioService;
