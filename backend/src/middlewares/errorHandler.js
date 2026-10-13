const { StockInsuficienteError } = require("../services/carrito.service");
const {
  CoberturaNoDisponibleError,
  DireccionNoAutorizadaError,
} = require("../services/envio.service");

// Errores de dominio de carrito/envío -> HTTP. Los services lanzan clases de
// dominio sin saber de HTTP; el mapeo vive acá (capa HTTP) para que los
// controllers puedan delegar con un simple throw (Express 5 reenvía las
// rejections async a este middleware).
//   - Stock insuficiente / sin cobertura: 409, conflicto de negocio (DDS §5.2).
//   - Dirección ajena: 404, "recurso no encontrado o sin acceso del usuario"
//     (DDS §5.2, RN-003) — igual que una dirección inexistente, para no
//     revelar que existe.
const ERRORES_DE_DOMINIO = [
  [StockInsuficienteError, { status: 409, codigo: "STOCK_INSUFICIENTE" }],
  [CoberturaNoDisponibleError, { status: 409, codigo: "SIN_COBERTURA" }],
  [DireccionNoAutorizadaError, { status: 404, codigo: "DIRECCION_NO_ENCONTRADA" }],
];

// Código por defecto cuando el error trae `status` pero no `codigo`.
const CODIGO_POR_STATUS = {
  400: "VALIDACION_FALLIDA",
  404: "NO_ENCONTRADO",
  409: "CONFLICTO",
};

// DDS §5.3: middleware final de manejo de errores de Express (firma de 4
// argumentos obligatoria para que Express lo reconozca como error handler).
// Formatea cualquier error no manejado explícitamente por un controller con
// la forma estándar { error: { codigo, mensaje, detalles } }. Debe
// registrarse ÚLTIMO en app.js, después de montar todas las rutas.
function errorHandler(err, req, res, next) {
  // Prisma: violación de constraint unique (P2002) — no debería llegar acá
  // para /direcciones (no tiene unique constraints propios), pero queda
  // como default razonable para cualquier controller futuro que no lo
  // capture explícitamente.
  if (err.code === "P2002") {
    console.error(err);
    return res.status(409).json({
      error: {
        codigo: "CONFLICTO",
        mensaje: "El recurso ya existe",
        detalles: err.meta ?? null,
      },
    });
  }

  const dominio = ERRORES_DE_DOMINIO.find(([Clase]) => err instanceof Clase)?.[1];
  const status = dominio?.status ?? err.status ?? err.statusCode ?? 500;

  // Los errores esperados (4xx) son parte del flujo normal: solo se loguean
  // los inesperados.
  if (status >= 500) {
    console.error(err);
  }

  return res.status(status).json({
    error: {
      codigo: dominio?.codigo ?? err.codigo ?? CODIGO_POR_STATUS[status] ?? "ERROR_INTERNO",
      mensaje: err.mensaje ?? err.message ?? "Ocurrió un error inesperado",
      detalles: err.detalles ?? null,
    },
  });
}

module.exports = errorHandler;
