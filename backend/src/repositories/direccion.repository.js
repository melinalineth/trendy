const prisma = require("../config/prisma");

// RN-003: un cliente NO puede acceder a direcciones de otros clientes.
// TODA consulta de acá filtra SIEMPRE por usuarioId (nunca se busca una
// Direccion solo por su id) — así es estructuralmente imposible devolver
// direcciones ajenas, sin depender de que el controller/service lo valide
// "a mano" cada vez que se agregue un endpoint nuevo.
//
// RF-005: una dirección dada de baja (`eliminadaEn` con fecha) la siguen
// usando los pedidos que ya la tenían, pero para el cliente no existe más:
// todas las consultas de acá la filtran. Los pedidos la leen por la relación
// (pedido.direccion), que no pasa por este módulo.

const VIGENTE = { eliminadaEn: null };

async function listarPorUsuario(usuarioId) {
  return prisma.direccion.findMany({
    where: { usuarioId, ...VIGENTE },
    orderBy: { id: "asc" },
  });
}

// Una dirección vigente del usuario por id. Cumple RN-003 como el resto: el
// where lleva usuarioId, así que una dirección ajena devuelve null (igual que
// una inexistente o dada de baja) en vez de depender de que el caller compare
// el dueño. La usan envio.service.calcularCosto y pedido.service.crearPedido,
// por eso comprar con una dirección eliminada falla con "no existe".
async function obtenerPorId(id, usuarioId) {
  return prisma.direccion.findFirst({
    where: { id: Number(id), usuarioId: Number(usuarioId), ...VIGENTE },
  });
}

// `client` es opcional en las operaciones que participan de un
// prisma.$transaction (el service lo usa al desmarcar la dirección principal
// anterior, al versionar o al dar de baja). Fuera de una transacción, usa el
// cliente centralizado de config/prisma.js.
async function crear(usuarioId, datos, client = prisma) {
  return client.direccion.create({
    data: { ...datos, usuarioId },
  });
}

// Desmarca todas las direcciones "esPrincipal" del usuario. Sigue el mismo
// contrato RN-003: el where siempre incluye usuarioId, nunca opera sobre
// todas las direcciones de la tabla.
async function desmarcarPrincipales(usuarioId, client = prisma) {
  return client.direccion.updateMany({
    where: { usuarioId, esPrincipal: true },
    data: { esPrincipal: false },
  });
}

// Toma el lock de escritura de TODAS las direcciones vigentes del usuario (en
// orden de id, así dos transacciones del mismo usuario no se cruzan en un
// deadlock) y devuelve sus ids. Cumple tres cosas a la vez:
//   - serializa las modificaciones y bajas del mismo usuario (dos "marcar como
//     principal" simultáneos no dejan dos principales);
//   - el INSERT de un Pedido sobre la dirección pide un lock compartido de esa
//     fila (FK): si hay un pedido en curso esto espera a que confirme, y el
//     conteo de pedidos que sigue ya lo ve;
//   - una baja simultánea de la misma dirección ya no la encuentra (404).
// Debe ser lo PRIMERO que lee la transacción (snapshot de REPEATABLE READ).
async function bloquearVigentesDelUsuario(usuarioId, client) {
  const filas =
    await client.$queryRaw`SELECT id FROM Direccion WHERE usuarioId = ${Number(usuarioId)} AND eliminadaEn IS NULL ORDER BY id FOR UPDATE`;

  return filas.map((fila) => Number(fila.id));
}

// Dirección vigente del usuario leída DENTRO de la transacción (ya con el lock).
async function obtenerVigente(id, usuarioId, client) {
  return client.direccion.findFirst({
    where: { id: Number(id), usuarioId: Number(usuarioId), ...VIGENTE },
  });
}

// Lectura con lock COMPARTIDO de una dirección vigente del usuario, para la
// transacción que crea un pedido: espera a las ediciones y bajas en curso (que
// piden el lock exclusivo con bloquearVigentesDelUsuario) y las bloquea hasta
// que el pedido confirme. Devuelve { id, ciudad, departamento } o null si ya no
// existe, no es del usuario o fue dada de baja. `LOCK IN SHARE MODE` (y no
// FOR SHARE) porque lo entienden MySQL y MariaDB.
async function bloquearCompartida(id, usuarioId, client) {
  const filas =
    await client.$queryRaw`SELECT id, ciudad, departamento FROM Direccion WHERE id = ${Number(id)} AND usuarioId = ${Number(usuarioId)} AND eliminadaEn IS NULL LOCK IN SHARE MODE`;

  return filas[0] ?? null;
}

// ¿Algún pedido (o su envío) apunta a esta dirección? Si sí, es la copia
// histórica de una entrega y no se puede modificar ni borrar.
async function tienePedidos(id, client = prisma) {
  const [pedidos, envios] = await Promise.all([
    client.pedido.count({ where: { direccionId: Number(id) } }),
    client.infoEnvio.count({ where: { direccionId: Number(id) } }),
  ]);

  return pedidos > 0 || envios > 0;
}

// Reemplaza los datos de la dirección en el lugar (solo si ningún pedido la
// usa, o si lo único que cambia es el flag de principal). El where lleva
// usuarioId (RN-003) aunque el id ya salió de una lectura del mismo usuario.
async function actualizar(id, usuarioId, datos, client = prisma) {
  return client.direccion.update({
    where: { id: Number(id), usuarioId: Number(usuarioId) },
    data: datos,
  });
}

// Baja física: solo para direcciones sin pedidos (la FK de Pedido e InfoEnvio
// la impediría igual).
async function eliminar(id, usuarioId, client = prisma) {
  return client.direccion.delete({
    where: { id: Number(id), usuarioId: Number(usuarioId) },
  });
}

// Baja lógica: la dirección sigue en la tabla para los pedidos que la usan,
// pero deja de estar vigente y deja de ser la principal.
async function darDeBaja(id, usuarioId, client = prisma) {
  return client.direccion.update({
    where: { id: Number(id), usuarioId: Number(usuarioId) },
    data: { eliminadaEn: new Date(), esPrincipal: false },
  });
}

// La dirección vigente más reciente del usuario (mayor id), o null. Es la que
// pasa a ser principal cuando se elimina la principal.
async function obtenerMasReciente(usuarioId, client = prisma) {
  return client.direccion.findFirst({
    where: { usuarioId: Number(usuarioId), ...VIGENTE },
    orderBy: { id: "desc" },
  });
}

module.exports = {
  listarPorUsuario,
  obtenerPorId,
  crear,
  desmarcarPrincipales,
  bloquearVigentesDelUsuario,
  bloquearCompartida,
  obtenerVigente,
  tienePedidos,
  actualizar,
  eliminar,
  darDeBaja,
  obtenerMasReciente,
};
