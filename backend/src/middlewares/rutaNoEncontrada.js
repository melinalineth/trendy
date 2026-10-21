// 404 para rutas que no existen. Sin esto, Express contesta con su página HTML
// por defecto («Cannot GET /x»), y un cliente de la API que espera JSON se
// rompe al parsearla. Acá se responde con el formato estándar de error
// { error: { codigo, mensaje, detalles } } (DDS §5.3).
//
// Debe registrarse en app.js DESPUÉS de montar todos los routers y ANTES de
// errorHandler: Express llega a este middleware solo si ninguna ruta anterior
// respondió, así que no puede tapar rutas reales. Tiene 3 argumentos (no es un
// error handler): lo que falla dentro de una ruta sigue yendo a errorHandler.
//
// A propósito el mensaje es fijo y no repite la URL pedida: no se refleja
// entrada del cliente ni se expone nada interno.
function rutaNoEncontrada(req, res) {
  return res.status(404).json({
    error: {
      codigo: "RUTA_NO_ENCONTRADA",
      mensaje: "La ruta solicitada no existe",
      detalles: null,
    },
  });
}

module.exports = rutaNoEncontrada;
