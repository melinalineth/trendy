const crypto = require("crypto");

const usuarioRepository = require("../repositories/usuario.repository");
const rolRepository = require("../repositories/rol.repository");
const passwordResetTokenRepository = require("../repositories/passwordResetToken.repository");
const { hashPassword, comparePassword } = require("../utils/hash");
const { generarToken } = require("../utils/jwt");

// RF-003: el enlace/código de recuperación vence a los 30 minutos.
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

class CredencialesInvalidasError extends Error {}
class TokenInvalidoError extends Error {}

function sanitizar(usuario) {
  const { passwordHash, ...resto } = usuario;
  return resto;
}

async function registrar({ nombre, correo, password }) {
  const rolCliente = await rolRepository.buscarPorNombre(rolRepository.ROL_CLIENTE);
  const passwordHash = await hashPassword(password);

  const usuario = await usuarioRepository.crear({
    nombre,
    correo,
    passwordHash,
    rolId: rolCliente?.id,
  });

  return sanitizar(usuario);
}

async function login({ correo, password }) {
  const usuario = await usuarioRepository.buscarPorCorreo(correo);

  // RF-002: mensaje genérico tanto si el correo no existe como si la
  // contraseña es incorrecta — nunca revelar cuál de los dos falló.
  if (!usuario) {
    throw new CredencialesInvalidasError("Correo o contraseña incorrectos");
  }

  const passwordValida = await comparePassword(password, usuario.passwordHash);
  if (!passwordValida) {
    throw new CredencialesInvalidasError("Correo o contraseña incorrectos");
  }

  // RF-007: la desactivación de un usuario (ej: un vendedor deshabilitado
  // por un admin) debe impedir nuevos logins. Se chequea DESPUÉS de validar
  // la contraseña, no antes, y se reusa el mismo mensaje genérico de
  // credenciales inválidas — así la respuesta no permite a un atacante
  // distinguir "cuenta inactiva" de "contraseña incorrecta" y enumerar
  // cuentas desactivadas.
  if (usuario.estado === "INACTIVO") {
    throw new CredencialesInvalidasError("Correo o contraseña incorrectos");
  }

  const token = generarToken(usuario);

  return { token, usuario: sanitizar(usuario) };
}

async function solicitarRecuperacion({ correo }) {
  const usuario = await usuarioRepository.buscarPorCorreo(correo);

  // RF-003: el sistema NUNCA revela si el correo está registrado. Si no
  // existe, simplemente no se genera token y el controller responde igual
  // el mensaje genérico de éxito.
  if (!usuario) {
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiraEn = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await passwordResetTokenRepository.crear({
    usuarioId: usuario.id,
    token,
    expiraEn,
  });

  // Limitación conocida del MVP: no hay servicio de correo (MOD-08 diferido
  // a v2.0). Se loguea el token por consola en vez de enviarlo por email.
  console.log(`[recuperar-password] token generado para ${correo}: ${token}`);
}

async function restablecerPassword({ token, password }) {
  const registro = await passwordResetTokenRepository.buscarPorToken(token);

  const esValido = registro && !registro.usado && registro.expiraEn > new Date();

  if (!esValido) {
    throw new TokenInvalidoError("El token es inválido, ya fue usado o venció");
  }

  const passwordHash = await hashPassword(password);

  await usuarioRepository.actualizarPassword(registro.usuarioId, passwordHash);
  await passwordResetTokenRepository.marcarUsado(registro.id);
}

module.exports = {
  registrar,
  login,
  solicitarRecuperacion,
  restablecerPassword,
  sanitizar,
  CredencialesInvalidasError,
  TokenInvalidoError,
};
