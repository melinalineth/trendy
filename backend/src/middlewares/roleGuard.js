// RF-006: control de acceso por roles. Se monta SIEMPRE DESPUÉS de auth.js
// en la cadena de middlewares de una ruta — asume que req.usuario ya existe
// (auth.js lo inyecta como { id, rolId, rol }, donde `rol` es el NOMBRE del
// rol en string; ver jwt.js, que ya lo incluye en el payload del JWT desde
// la Ronda 1). roleGuard compara por nombre para que las rutas queden
// legibles: router.post(ruta, auth, roleGuard(["admin", "vendedor"]), ctrl).
//
// Límite conocido (DDS §6.2, señalado en el controller de auth desde la
// Ronda 1): roleGuard protege la RUTA (¿tiene este usuario un rol
// permitido?), pero NO limita a un vendedor a sus PROPIOS recursos (ej: que
// un vendedor solo pueda editar SUS productos, no los de otro vendedor).
// Esa validación es de negocio y va a nivel de SERVICE, comparando el
// dueño del recurso contra req.usuario.id — se implementa en la Ronda 3
// cuando exista el primer endpoint de vendedor que lo necesite (no hay
// ninguno todavía en esta ronda). roleGuard por sí solo NO alcanza para
// ese caso: un roleGuard(["vendedor"]) deja pasar a CUALQUIER vendedor.
function roleGuard(rolesPermitidos) {
  return function (req, res, next) {
    const rol = req.usuario?.rol;

    if (!rol || !rolesPermitidos.includes(rol)) {
      return res.status(403).json({
        error: {
          codigo: "ACCESO_DENEGADO",
          mensaje: "No tenés permisos para acceder a este recurso",
          detalles: null,
        },
      });
    }

    return next();
  };
}

module.exports = roleGuard;
