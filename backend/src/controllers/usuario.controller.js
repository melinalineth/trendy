const usuarioService = require("../services/usuario.service");
const { cambiarEstadoSchema } = require("../dtos/usuario.dto");

function formatearErroresZod(error) {
  return error.issues.map((issue) => issue.message).join(", ");
}

// RF-045: gestión admin de usuarios (MOD-10). Es un controller NUEVO,
// distinto de auth.controller.js — auth.controller.js es MOD-01 (el usuario
// gestionando su propia cuenta), este es el admin gestionando cuentas ajenas.

async function listar(req, res) {
  const usuarios = await usuarioService.listar();
  return res.status(200).json(usuarios);
}

async function cambiarEstado(req, res) {
  const usuarioId = Number(req.params.id);
  if (!Number.isInteger(usuarioId)) {
    return res.status(400).json({ error: "El id del usuario es inválido" });
  }

  const parseo = cambiarEstadoSchema.safeParse(req.body ?? {});
  if (!parseo.success) {
    return res.status(400).json({ error: formatearErroresZod(parseo.error) });
  }

  try {
    const usuario = await usuarioService.cambiarEstado(usuarioId, parseo.data.estado);
    return res.status(200).json(usuario);
  } catch (error) {
    if (error instanceof usuarioService.UsuarioNoEncontradoError) {
      return res.status(404).json({ error: error.message });
    }

    console.error(error);
    return res.status(500).json({ error: "Error al cambiar el estado del usuario" });
  }
}

module.exports = {
  listar,
  cambiarEstado,
};
