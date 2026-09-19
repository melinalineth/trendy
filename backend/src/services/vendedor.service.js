const usuarioRepository = require("../repositories/usuario.repository");
const rolRepository = require("../repositories/rol.repository");

class VendedorNoEncontradoError extends Error {}
class UsuarioNoEsVendedorError extends Error {}

// RF-007: solo un administrador administra vendedores. Esta función es
// DELIBERADAMENTE específica de vendedores (no un cambiarEstado genérico):
// valida que el usuario objetivo exista Y tenga rol "vendedor", así esta
// ruta no puede usarse para cambiar el estado de un cliente o de otro admin
// — para eso está el endpoint separado de RF-045 (usuario.service), que sí
// es genérico por diseño.
//
// No elimina el historial de un vendedor desactivado: es un UPDATE de
// `estado`, nunca un delete.
async function cambiarEstado(vendedorId, nuevoEstado) {
  const usuario = await usuarioRepository.buscarPorId(vendedorId);

  if (!usuario) {
    throw new VendedorNoEncontradoError("El vendedor no existe");
  }

  if (usuario.rol?.nombre !== rolRepository.ROL_VENDEDOR) {
    throw new UsuarioNoEsVendedorError("El usuario indicado no tiene rol de vendedor");
  }

  return usuarioRepository.actualizarEstado(vendedorId, nuevoEstado);
}

module.exports = {
  cambiarEstado,
  VendedorNoEncontradoError,
  UsuarioNoEsVendedorError,
};
