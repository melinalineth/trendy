// Lectura del formato estándar de error del backend ({ error: { codigo,
// mensaje, detalles } }, DDS §5.3). Vive en un módulo propio para que todos
// los servicios y hooks lo compartan en vez de copiarlo (nació en
// zonaCobertura.service.js, Sprint 3).
//
// Devuelve siempre { status, codigo, mensaje, detalles, contexto } para que la
// UI no tenga que conocer la forma del payload:
//   - Sin respuesta (backend caído / red): status null y codigo
//     "SIN_CONEXION" con un mensaje propio.
//   - 5xx: se usa `mensajePorDefecto`; el backend puede devolver el message
//     crudo de una excepción interna, que no queremos mostrarle al usuario.
//   - 4xx: se usa el `mensaje` del backend (ej. ZONA_DUPLICADA, 403, 404).
//   - `detalles`: array de strings de 400 VALIDACION_FALLIDA ([] si no hay).
//   - `contexto`: cuando `detalles` es un objeto (ej. STOCK_INSUFICIENTE trae
//     { varianteId, disponible }, PRODUCTO_NO_DISPONIBLE { varianteId }) se
//     expone acá tal cual; si no, null.
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
      contexto: null,
    };
  }

  const esCliente = status < 500;

  const detalles = Array.isArray(error?.detalles)
    ? error.detalles.filter((detalle) => typeof detalle === "string")
    : [];

  const contexto =
    esCliente &&
    error?.detalles !== null &&
    typeof error?.detalles === "object" &&
    !Array.isArray(error.detalles)
      ? error.detalles
      : null;

  const mensajeBackend =
    esCliente && typeof error?.mensaje === "string" ? error.mensaje : "";

  return {
    status,
    codigo: typeof error?.codigo === "string" ? error.codigo : null,
    mensaje: mensajeBackend || mensajePorDefecto,
    detalles: esCliente ? detalles : [],
    contexto,
  };
}
