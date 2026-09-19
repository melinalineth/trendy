const usuarioRepository = require("../repositories/usuario.repository");
const { sanitizar } = require("./auth.service");

class UsuarioNoEncontradoError extends Error {}

// RF-045: el admin consulta TODOS los usuarios registrados (cualquier rol),
// junto con el rol asignado a cada uno. Nunca incluye passwordHash en la
// respuesta — se reusa `sanitizar` de auth.service.js (Ronda 1) en vez de
// duplicar la lógica de destructuring.
async function listar() {
  const usuarios = await usuarioRepository.listarTodos();
  return usuarios.map(sanitizar);
}

// RF-045: a diferencia de RF-007 (vendedor.service), esta función NO
// restringe por rol del usuario objetivo — el admin puede cambiar el estado
// de cualquier usuario (cliente, vendedor u otro admin).
async function cambiarEstado(usuarioId, nuevoEstado) {
  const usuario = await usuarioRepository.buscarPorId(usuarioId);

  if (!usuario) {
    throw new UsuarioNoEncontradoError("El usuario no existe");
  }

  const actualizado = await usuarioRepository.actualizarEstado(usuarioId, nuevoEstado);
  return sanitizar(actualizado);
}

module.exports = {
  listar,
  cambiarEstado,
  UsuarioNoEncontradoError,
};
