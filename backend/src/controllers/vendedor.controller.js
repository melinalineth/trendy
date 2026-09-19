const vendedorService = require("../services/vendedor.service");
const { cambiarEstadoSchema } = require("../dtos/vendedor.dto");
const { sanitizar } = require("../services/auth.service");

function formatearErroresZod(error) {
  return error.issues.map((issue) => issue.message).join(", ");
}

async function cambiarEstado(req, res) {
  const vendedorId = Number(req.params.id);
  if (!Number.isInteger(vendedorId)) {
    return res.status(400).json({ error: "El id del vendedor es inválido" });
  }

  const parseo = cambiarEstadoSchema.safeParse(req.body ?? {});
  if (!parseo.success) {
    return res.status(400).json({ error: formatearErroresZod(parseo.error) });
  }

  try {
    const vendedor = await vendedorService.cambiarEstado(vendedorId, parseo.data.estado);
    return res.status(200).json(sanitizar(vendedor));
  } catch (error) {
    if (error instanceof vendedorService.VendedorNoEncontradoError) {
      return res.status(404).json({ error: error.message });
    }

    if (error instanceof vendedorService.UsuarioNoEsVendedorError) {
      return res.status(400).json({ error: error.message });
    }

    console.error(error);
    return res.status(500).json({ error: "Error al cambiar el estado del vendedor" });
  }
}

module.exports = {
  cambiarEstado,
};
