const { verificarToken } = require("../utils/jwt");

// Lee el header Authorization: Bearer <token>, valida el JWT e inyecta
// req.usuario. Responde 401 si falta el header o el token es inválido/expiró.
function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de autenticación requerido" });
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verificarToken(token);
    req.usuario = { id: payload.id, rolId: payload.rolId, rol: payload.rol };
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

module.exports = auth;
