import api from "./apiClient";

// Administración de zonas de cobertura y tarifas de envío (RF-026). Todos los
// endpoints son solo para el rol "admin" (cliente/vendedor reciben 403).

// GET /api/v1/zonas-cobertura -> incluye zonas INACTIVAS. Cada zona trae
// { id, nombre, departamento, ciudad, estado, tarifaActiva: {id, costo, estado} | null }.
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

// Lee el formato estándar de error del backend ({ error: { codigo, mensaje,
// detalles } }) y devuelve siempre { status, codigo, mensaje, detalles } para
// que la UI no tenga que conocer la forma del payload.
//   - Sin respuesta (backend caído / red) o 5xx: se usa `mensajePorDefecto`;
//     en 5xx el backend puede devolver el message crudo de una excepción
//     interna, que no queremos mostrarle al usuario.
//   - 4xx: se usa el `mensaje` del backend (ej. ZONA_DUPLICADA, 403, 404).
//   - `detalles` es un array de strings en 400 VALIDACION_FALLIDA.
export function obtenerErrorApi(err, mensajePorDefecto) {
  const status = err?.response?.status ?? null;
  const error = err?.response?.data?.error;

  if (status === null) {
    return {
      status,
      codigo: "SIN_CONEXION",
      mensaje:
        "No pudimos conectarnos con el servidor. Revisá tu conexión e intentá de nuevo.",
      detalles: [],
    };
  }

  const detalles = Array.isArray(error?.detalles)
    ? error.detalles.filter((detalle) => typeof detalle === "string")
    : [];

  const mensajeBackend =
    status < 500 && typeof error?.mensaje === "string" ? error.mensaje : "";

  return {
    status,
    codigo: typeof error?.codigo === "string" ? error.codigo : null,
    mensaje: mensajeBackend || mensajePorDefecto,
    detalles: status < 500 ? detalles : [],
  };
}

const zonaCoberturaService = {
  listarZonas,
  crearZona,
  cambiarTarifa,
  cambiarEstado,
};

export default zonaCoberturaService;
