import api from "./apiClient";

// Administración de zonas de cobertura y tarifas de envío (RF-026). Todos los
// endpoints son solo para el rol "admin" (cliente/vendedor reciben 403).

// GET /api/v1/zonas-cobertura -> incluye zonas INACTIVAS. Cada zona trae
// { id, nombre, departamento, ciudad, estado, permiteContraEntrega,
// tarifaActiva: {id, costo, estado} | null }.
function listarZonas() {
  return api.get("/zonas-cobertura").then((response) => response.data);
}

// El backend espera la tarifa inicial ANIDADA ({ tarifa: { costo } }); acá se
// acepta `costo` plano (como lo describe la tarjeta) y se arma el body real.
// `costo` debe ser un number: el DTO del backend rechaza strings.
function crearZona({ nombre, departamento, ciudad, costo }) {
  return api
    .post("/zonas-cobertura", {
      nombre,
      departamento,
      ciudad,
      tarifa: { costo },
    })
    .then((response) => response.data);
}

// PUT /:id/tarifa: el backend desactiva la tarifa vigente y crea la nueva
// (el historial se conserva).
function cambiarTarifa(id, costo) {
  return api
    .put(`/zonas-cobertura/${id}/tarifa`, { costo })
    .then((response) => response.data);
}

// PATCH /:id/estado con "ACTIVO" | "INACTIVO".
function cambiarEstado(id, estado) {
  return api
    .patch(`/zonas-cobertura/${id}/estado`, { estado })
    .then((response) => response.data);
}

// PATCH /:id/contra-entrega con un boolean JSON estricto (RF-037, RN-006): el
// backend rechaza "true" o 1. La respuesta es la zona con `permiteContraEntrega`.
function actualizarContraEntrega(id, permiteContraEntrega) {
  return api
    .patch(`/zonas-cobertura/${id}/contra-entrega`, { permiteContraEntrega })
    .then((response) => response.data);
}

// La lectura de errores ({ error: { codigo, mensaje, detalles } }) vive en
// services/apiError.js, compartida con pedidos y pagos.

const zonaCoberturaService = {
  listarZonas,
  crearZona,
  cambiarTarifa,
  cambiarEstado,
  actualizarContraEntrega,
};

export default zonaCoberturaService;
