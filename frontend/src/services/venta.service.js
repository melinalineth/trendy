import api from "./apiClient";

// Ventas (Sprint 5, MOD-09 / RF-042). Solo lectura: las ventas las registra el
// backend al aprobarse el pago o al confirmarse el pedido contra entrega. Los
// montos llegan como Number (pesos COP) y los errores como { error: { codigo,
// mensaje, detalles } } (leerlos con obtenerErrorApi de services/apiError.js).

// Filtros que acepta GET /ventas. El backend rechaza valores vacíos (400), así
// que solo se mandan los que tienen valor.
const FILTROS_LISTADO = ["desde", "hasta", "estado", "pagina", "limite"];

function armarParams(filtros) {
  const params = {};

  FILTROS_LISTADO.forEach((clave) => {
    const valor = filtros[clave];
    const texto = typeof valor === "string" ? valor.trim() : valor;

    if (texto !== undefined && texto !== null && texto !== "") {
      params[clave] = texto;
    }
  });

  return params;
}

// GET /ventas (admin y vendedor: ambos ven TODAS las ventas en v1.0; un
// cliente recibe 403). `desde`/`hasta` son AAAA-MM-DD en America/Bogota
// (inclusivos), `estado` REGISTRADA | ANULADA, `limite` máximo 100. Responde
// { ventas: [...], paginacion: { pagina, limite, total, totalPaginas },
// totales: { registradas: { cantidad, total }, anuladas: { cantidad, total } } }
// con `totales` calculado sobre TODAS las ventas que cumplen los filtros (no
// solo la página). Cada venta trae el pedido, el cliente, el responsable (null
// si la registró el webhook de Mercado Pago) y sus `productos` con el precio
// HISTÓRICO de la venta.
export function listarVentas(filtros = {}) {
  return api
    .get("/ventas", { params: armarParams(filtros) })
    .then((response) => response.data);
}

const ventaService = {
  listarVentas,
};

export default ventaService;
