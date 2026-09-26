const varianteService = require("../services/variante.service");
const { crearVarianteSchema } = require("../dtos/variante.dto");

function formatearErroresZod(error) {
  return error.issues.map((issue) => issue.message).join(", ");
}

// RF-016: alta de variante (talla/color/SKU/stock) de un producto.
async function crear(req, res) {
  const { id } = req.params;
  if (Number.isNaN(Number(id))) {
    return res.status(400).json({ error: "id debe ser numérico" });
  }

  const parseo = crearVarianteSchema.safeParse(req.body ?? {});
  if (!parseo.success) {
    return res.status(400).json({ error: formatearErroresZod(parseo.error) });
  }

  try {
    const variante = await varianteService.crear(id, parseo.data);
    return res.status(201).json(variante);
  } catch (error) {
    if (error instanceof varianteService.ProductoNoEncontradoError) {
      return res.status(404).json({ error: error.message });
    }

    if (error instanceof varianteService.VarianteDuplicadaError) {
      return res.status(409).json({ error: error.message });
    }

    console.error(error);
    return res.status(500).json({ error: "Error al crear la variante" });
  }
}

module.exports = {
  crear,
};
