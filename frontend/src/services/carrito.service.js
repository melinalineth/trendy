import api from "./apiClient";

// Evento del navegador que avisa que el carrito del cliente cambió (se
// agregó, modificó o eliminó una línea). Mismo mecanismo que
// AUTH_LOGOUT_EVENT en apiClient: evita montar un contexto global solo para
// que el contador del Header se entere de lo que hace el detalle de producto
// o la página del carrito. `detail.cantidad` (opcional) trae la cantidad de
// líneas ya calculada para ahorrar un request.
export const CARRITO_ACTUALIZADO_EVENT = "trendy:carrito-actualizado";

// Códigos de error del contrato ({ error: { codigo, mensaje, detalles } }).
export const CODIGO_STOCK_INSUFICIENTE = "STOCK_INSUFICIENTE";
export const CODIGO_SIN_COBERTURA = "SIN_COBERTURA";

// Extrae el error del formato estándar del backend. Si la respuesta no trae
// ese cuerpo (corte de red, 500 sin JSON) devuelve el mensaje de respaldo.
export function leerErrorApi(err, mensajeRespaldo) {
  const cuerpo = err?.response?.data?.error;

  return {
    status: err?.response?.status ?? null,
    codigo: cuerpo?.codigo ?? null,
    mensaje: cuerpo?.mensaje || mensajeRespaldo,
  };
}

// GET /carrito: resumen sin costo de envío (todavía no hay dirección).
function obtenerCarrito() {
  return api.get("/carrito").then((response) => response.data);
}

// POST /carrito/items (RF-021). Responde 201 con la línea creada/actualizada,
// no con el resumen: quien necesite el carrito completo lo vuelve a pedir.
function agregarItem(varianteId, cantidad) {
  return api
    .post("/carrito/items", { varianteId, cantidad })
    .then((response) => response.data);
}

// PUT /carrito/items/:id (RF-022). `cantidad` es la nueva cantidad total de
// la línea, no un incremento.
function modificarItem(itemId, cantidad) {
  return api
    .put(`/carrito/items/${itemId}`, { cantidad })
    .then((response) => response.data);
}

// DELETE /carrito/items/:id (RF-022). Si el carrito queda vacío el backend
// responde `vacio: true` con un mensaje.
function eliminarItem(itemId) {
  return api
    .delete(`/carrito/items/${itemId}`)
    .then((response) => response.data);
}

// GET /carrito/resumen (RF-024). `direccionId` es opcional: sin él el costo
// de envío es 0; con él se calcula según la zona/tarifa de esa dirección
// (409 SIN_COBERTURA si no hay cobertura, 404 si la dirección no es del
// usuario).
function obtenerResumen(direccionId) {
  const params = direccionId ? { direccionId } : undefined;

  return api
    .get("/carrito/resumen", { params })
    .then((response) => response.data);
}

const carritoService = {
  obtenerCarrito,
  agregarItem,
  modificarItem,
  eliminarItem,
  obtenerResumen,
};

export default carritoService;
