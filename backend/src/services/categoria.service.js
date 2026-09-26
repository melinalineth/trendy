const categoriaRepository = require("../repositories/categoria.repository");

// Capa fina sobre el repository: no hay reglas de negocio adicionales para
// RF-008 (el filtrado por estado ya lo resuelve categoriaRepository), pero
// se mantiene el service para seguir el patrón Controller -> Service ->
// Repository ya establecido en el resto del backend (rol/usuario/direccion).
async function listar() {
  return categoriaRepository.listarActivas();
}

module.exports = {
  listar,
};
