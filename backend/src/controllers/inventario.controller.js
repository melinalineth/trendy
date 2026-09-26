const inventarioService = require("../services/inventario.service");
const { crearAjusteSchema } = require("../dtos/inventario.dto");

function formatearErroresZod(error) {
  return error.issues.map((issue) => issue.message).join(", ");
}

// RF-017: vista general de inventario — una fila por variante con su stock
// actual. Requiere auth + roleGuard(["admin","vendedor"]).
async function listar(req, res) {
  try {
    const variantes = await inventarioService.listarTodo();
    return res.status(200).json(variantes);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al listar el inventario" });
  }
}

// RF-017: alta de un movimiento de inventario (ENTRADA/SALIDA/AJUSTE) que
// ajusta Variante.stock. RN-002: el stock nunca queda negativo — ese
// rechazo se traduce acá a un 409.
async function registrarAjuste(req, res) {
  const parseo = crearAjusteSchema.safeParse(req.body ?? {});
  if (!parseo.success) {
    return res.status(400).json({ error: formatearErroresZod(parseo.error) });
  }

  const { varianteId, cantidad, tipoAjuste, motivo } = parseo.data;

  try {
    const resultado = await inventarioService.registrarAjuste(
      varianteId,
      cantidad,
      tipoAjuste,
      motivo,
      req.usuario?.id
    );
    return res.status(201).json(resultado);
  } catch (error) {
    if (error instanceof inventarioService.VarianteNoEncontradaError) {
      return res.status(404).json({ error: error.message });
    }

    if (error instanceof inventarioService.StockInsuficienteError) {
      return res.status(409).json({ error: error.message });
    }

    console.error(error);
    return res.status(500).json({ error: "Error al registrar el ajuste de inventario" });
  }
}

// RF-017: historial de movimientos de UNA variante.
async function historialPorVariante(req, res) {
  const { varianteId } = req.params;
  if (Number.isNaN(Number(varianteId))) {
    return res.status(400).json({ error: "varianteId debe ser numérico" });
  }

  try {
    const historial = await inventarioService.listarPorVariante(varianteId);
    return res.status(200).json(historial);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al obtener el historial de la variante" });
  }
}

module.exports = {
  listar,
  registrarAjuste,
  historialPorVariante,
};
