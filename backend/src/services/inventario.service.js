const inventarioRepository = require("../repositories/inventario.repository");

// RF-017: capa fina entre controller y repository — reexporta los errores
// de dominio del repository tal cual (mismo criterio que producto.service
// reexportando ProductoNoEncontradoError) para que el controller los pueda
// mapear a status HTTP sin depender directamente del repository.
async function registrarAjuste(varianteId, cantidad, tipoAjuste, motivo, usuarioId) {
  return inventarioRepository.registrarAjuste(
    Number(varianteId),
    Number(cantidad),
    tipoAjuste,
    motivo,
    Number(usuarioId)
  );
}

async function listarPorVariante(varianteId) {
  return inventarioRepository.listarPorVariante(Number(varianteId));
}

async function listarTodo() {
  return inventarioRepository.listarTodo();
}

module.exports = {
  registrarAjuste,
  listarPorVariante,
  listarTodo,
  VarianteNoEncontradaError: inventarioRepository.VarianteNoEncontradaError,
  StockInsuficienteError: inventarioRepository.StockInsuficienteError,
};
