// DDS §5.3: middleware final de manejo de errores de Express (firma de 4
// argumentos obligatoria para que Express lo reconozca como error handler).
// Formatea cualquier error no manejado explícitamente por un controller con
// la forma estándar { error: { codigo, mensaje, detalles } }. Debe
// registrarse ÚLTIMO en app.js, después de montar todas las rutas.
function errorHandler(err, req, res, next) {
  console.error(err);

  // Prisma: violación de constraint unique (P2002) — no debería llegar acá
  // para /direcciones (no tiene unique constraints propios), pero queda
  // como default razonable para cualquier controller futuro que no lo
  // capture explícitamente.
  if (err.code === "P2002") {
    return res.status(409).json({
      error: {
        codigo: "CONFLICTO",
        mensaje: "El recurso ya existe",
        detalles: err.meta ?? null,
      },
    });
  }

  const status = err.status ?? err.statusCode ?? 500;

  return res.status(status).json({
    error: {
      codigo: err.codigo ?? "ERROR_INTERNO",
      mensaje: err.mensaje ?? err.message ?? "Ocurrió un error inesperado",
      detalles: err.detalles ?? null,
    },
  });
}

module.exports = errorHandler;
