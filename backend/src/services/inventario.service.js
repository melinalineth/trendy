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

// RF-019: sin endpoint HTTP — la invoca Sprint 4 (pedidos/pagos). items es
// [{ varianteId, cantidad }]; se pasa tal cual (sin Number()) porque llega de
// código interno y el repository rechaza lo que no sea entero positivo en vez
// de coercionarlo en silencio. Ver opciones (usuarioId, pedidoId, tx) en el
// repository.
async function descontarPorPedido(items, opciones) {
  return inventarioRepository.descontarPorPedido(items, opciones);
}

async function listarPorVariante(varianteId) {
  return inventarioRepository.listarPorVariante(Number(varianteId));
}

async function listarTodo() {
  return inventarioRepository.listarTodo();
}

module.exports = {
  registrarAjuste,
  descontarPorPedido,
  listarPorVariante,
  listarTodo,
  VarianteNoEncontradaError: inventarioRepository.VarianteNoEncontradaError,
  StockInsuficienteError: inventarioRepository.StockInsuficienteError,
  DescuentoInvalidoError: inventarioRepository.DescuentoInvalidoError,
};
