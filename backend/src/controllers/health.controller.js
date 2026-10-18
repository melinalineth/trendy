const healthRepository = require("../repositories/health.repository");

// Tiempo máximo que se espera a la base: un healthcheck que se cuelga es peor
// que uno que falla (Docker lo reintentaría sin ver nunca un error).
const TIMEOUT_BASE_MS = 3000;

class BaseDeDatosNoDisponibleError extends Error {
  constructor(causa) {
    // Mensaje genérico a propósito: la causa real (host, usuario, código de
    // MySQL) va solo al log del servidor, vía `cause`, y nunca a la respuesta.
    super("La base de datos no responde", { cause: causa });
    this.name = "BaseDeDatosNoDisponibleError";
    this.status = 503;
    this.codigo = "BASE_DE_DATOS_NO_DISPONIBLE";
  }
}

// Público (sin auth). Express 5 reenvía las rejections async a errorHandler.js,
// que responde el 503 con { error: { codigo, mensaje, detalles } } (DDS §5.3).
//
// GET /api/v1/health
async function consultar(req, res) {
  let temporizador;

  try {
    await Promise.race([
      healthRepository.ping(),
      new Promise((_, rechazar) => {
        temporizador = setTimeout(
          () => rechazar(new Error(`la base no contestó en ${TIMEOUT_BASE_MS} ms`)),
          TIMEOUT_BASE_MS
        );
      }),
    ]);
  } catch (error) {
    throw new BaseDeDatosNoDisponibleError(error);
  } finally {
    clearTimeout(temporizador);
  }

  return res.status(200).json({ estado: "ok" });
}

module.exports = { consultar };
