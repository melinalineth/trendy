const jwt = require("jsonwebtoken");

// RF-002: al iniciar sesión el usuario obtiene un JWT con su rol. Payload
// mínimo necesario para el roleGuard de la Ronda 2: id, rolId y el nombre
// del rol (evita un round-trip extra a DB solo para leer el rol).
function generarToken(usuario) {
  const payload = {
    id: usuario.id,
    rolId: usuario.rolId,
    rol: usuario.rol?.nombre,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  });
}

function verificarToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = {
  generarToken,
  verificarToken,
};
