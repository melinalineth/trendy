const direccionRepository = require("../repositories/direccion.repository");
// Misma transacción con reintentos que usa la creación de pedidos: repite la
// transacción completa ante deadlock (1213), lock wait timeout (1205) o P2034.
const { enTransaccion } = require("./pedido.service");

// RF-005 (editar y eliminar) y la "copia histórica" del pedido.
//
// Cómo guarda el schema la dirección de un pedido: Pedido.direccionId e
// InfoEnvio.direccionId son FK a la fila de Direccion, SIN copiar sus campos
// al pedido. Es decir, la fila ES la copia histórica de la entrega: si se
// editara en el lugar, el pedido ya hecho (y su envío) cambiarían de
// destinatario o calle; si se borrara, la FK lo impediría. Se eligió, entonces,
// no tocar jamás los DATOS DE ENTREGA de una fila que un pedido usa, en vez de
// migrar el schema a copiar campos en cada pedido:
//
//   - Editar:   sin pedidos -> UPDATE en el lugar (mismo id). Con pedidos y
//               cambio en los datos de entrega -> se CREA una fila nueva con los
//               datos nuevos (id nuevo, la que ve el cliente) y la original se da
//               de baja lógica: los pedidos siguen apuntando a la original,
//               intacta. Si los datos de entrega no cambian, no se escriben.
//   - Eliminar: sin pedidos -> DELETE real (el cliente espera que el dato se
//               borre). Con pedidos -> baja lógica (`eliminadaEn`): desaparece
//               del listado y no se puede elegir para comprar, pero Pedido e
//               InfoEnvio la siguen mostrando tal cual.
//
// `esPrincipal` NO es parte de la copia histórica: es un metadato de la cuenta
// ("cuál uso por defecto") y cambia aunque la fila la use un pedido (marcar
// como principal, o la promoción al borrar la principal). Por eso las
// respuestas de pedido nunca lo muestran (pedido.service.presentarDireccion).
//
// Concurrencia: cada operación corre en UNA transacción (con reintentos) cuyo
// PRIMER paso es bloquear las direcciones vigentes del usuario
// (bloquearVigentesDelUsuario). Alta, edición, marca de principal y baja del
// mismo usuario se serializan (nunca dos principales ni deadlocks entre ellas).
// La compra, por su parte, relee la dirección con lock compartido dentro de la
// transacción del pedido (pedido.service.crearEnTransaccion): una edición o baja
// concurrente o termina antes (y la compra falla con un error claro) o espera.

// Campos que definen a dónde se entrega. `esPrincipal` NO es uno de ellos.
const CAMPOS_DE_ENTREGA = Object.freeze([
  "destinatario",
  "telefono",
  "calle",
  "ciudad",
  "departamento",
  "codigoPostal",
  "referencia",
]);

// RN-003: una dirección ajena responde igual que una inexistente o dada de
// baja (404) para no revelar que existe. `status` y `codigo` viajan en el
// error y errorHandler.js lo formatea sin tener que registrarlo.
class DireccionNoEncontradaError extends Error {
  constructor(message = "La dirección no existe") {
    super(message);
    this.name = "DireccionNoEncontradaError";
    this.status = 404;
    this.codigo = "DIRECCION_NO_ENCONTRADA";
  }
}

async function listar(usuarioId) {
  return direccionRepository.listarPorUsuario(usuarioId);
}

async function crear(usuarioId, datos) {
  if (!datos.esPrincipal) {
    return direccionRepository.crear(usuarioId, datos);
  }

  // Si la nueva dirección se marca como principal, desmarcar las demás del
  // mismo usuario y crear la nueva dentro de la MISMA transacción: evita
  // que, ante una falla a mitad de camino, queden dos direcciones (o
  // ninguna) marcadas como principal para ese usuario. El lock del usuario va
  // PRIMERO, igual que en editar y eliminar: sin él, dos altas principales
  // simultáneas dejaban dos principales o se cruzaban en un deadlock.
  return enTransaccion("CREAR_DIRECCION", async (tx) => {
    await direccionRepository.bloquearVigentesDelUsuario(usuarioId, tx);
    await direccionRepository.desmarcarPrincipales(usuarioId, tx);
    return direccionRepository.crear(usuarioId, datos, tx);
  });
}

// Con el lock tomado, la dirección vigente del usuario o 404.
async function obtenerBloqueada(usuarioId, id, tx) {
  const vigentes = await direccionRepository.bloquearVigentesDelUsuario(usuarioId, tx);
  const actual = vigentes.includes(id)
    ? await direccionRepository.obtenerVigente(id, usuarioId, tx)
    : null;

  if (!actual) {
    throw new DireccionNoEncontradaError();
  }

  return actual;
}

// null, undefined, "" y solo espacios son "sin valor". Los textos que llegan
// del DTO ya vienen sin espacios en los bordes (trim).
const vacioANull = (valor) => (valor === undefined || valor === null || valor === "" ? null : valor);

function cambiaLaEntrega(actual, nuevos) {
  return CAMPOS_DE_ENTREGA.some((campo) => vacioANull(actual[campo]) !== vacioANull(nuevos[campo]));
}

/**
 * PUT /api/v1/direcciones/:id. Reemplaza los datos de entrega (los opcionales
 * que no vienen, o vienen vacíos, quedan en null) y, si viene `esPrincipal`, lo
 * aplica; sin él conserva el que tenía. Devuelve la dirección vigente: su `id`
 * es el mismo salvo que un pedido usara la original y cambiaran los datos de
 * entrega.
 */
async function actualizar(usuarioId, id, datos) {
  return enTransaccion("ACTUALIZAR_DIRECCION", async (tx) => {
    const actual = await obtenerBloqueada(usuarioId, id, tx);

    const nuevos = {
      destinatario: datos.destinatario,
      telefono: datos.telefono,
      calle: datos.calle,
      ciudad: datos.ciudad,
      departamento: datos.departamento,
      codigoPostal: vacioANull(datos.codigoPostal),
      referencia: vacioANull(datos.referencia),
    };
    const esPrincipal = datos.esPrincipal ?? actual.esPrincipal;

    // Marcar como principal desmarca a la anterior (una sola por usuario).
    if (esPrincipal && !actual.esPrincipal) {
      await direccionRepository.desmarcarPrincipales(usuarioId, tx);
    }

    if (!cambiaLaEntrega(actual, nuevos)) {
      // Los datos de entrega quedan EXACTAMENTE como estaban (ni siquiera se
      // normaliza un "" viejo): lo único que puede cambiar es el flag.
      return esPrincipal === actual.esPrincipal
        ? actual
        : direccionRepository.actualizar(actual.id, usuarioId, { esPrincipal }, tx);
    }

    if (!(await direccionRepository.tienePedidos(actual.id, tx))) {
      return direccionRepository.actualizar(actual.id, usuarioId, { ...nuevos, esPrincipal }, tx);
    }

    // La fila la usa un pedido: no se toca; la versión nueva la reemplaza.
    const nueva = await direccionRepository.crear(usuarioId, { ...nuevos, esPrincipal }, tx);
    await direccionRepository.darDeBaja(actual.id, usuarioId, tx);

    return nueva;
  });
}

/**
 * PATCH /api/v1/direcciones/:id con { esPrincipal }. Cambia SOLO el flag, sin
 * releer ni reescribir los datos de entrega (no pisa cambios hechos desde otra
 * pestaña ni versiona una dirección con pedidos). Marcarla desmarca a la
 * anterior; desmarcarla deja al usuario sin principal. Devuelve la dirección.
 */
async function marcarPrincipal(usuarioId, id, esPrincipal) {
  return enTransaccion("MARCAR_PRINCIPAL_DIRECCION", async (tx) => {
    const actual = await obtenerBloqueada(usuarioId, id, tx);

    if (esPrincipal === actual.esPrincipal) {
      return actual;
    }

    if (esPrincipal) {
      await direccionRepository.desmarcarPrincipales(usuarioId, tx);
    }

    return direccionRepository.actualizar(actual.id, usuarioId, { esPrincipal }, tx);
  });
}

/**
 * DELETE /api/v1/direcciones/:id. Si era la principal, la más reciente de las
 * que quedan pasa a serlo (si no queda ninguna, el usuario queda sin
 * principal). Nota de consistencia: el alta NO marca principal sola a la
 * primera dirección; esa promoción existe para que, al borrar la principal,
 * el cliente conserve una predeterminada.
 */
async function eliminar(usuarioId, id) {
  await enTransaccion("ELIMINAR_DIRECCION", async (tx) => {
    const actual = await obtenerBloqueada(usuarioId, id, tx);

    if (await direccionRepository.tienePedidos(actual.id, tx)) {
      await direccionRepository.darDeBaja(actual.id, usuarioId, tx);
    } else {
      await direccionRepository.eliminar(actual.id, usuarioId, tx);
    }

    if (actual.esPrincipal) {
      const siguiente = await direccionRepository.obtenerMasReciente(usuarioId, tx);

      if (siguiente) {
        await direccionRepository.actualizar(siguiente.id, usuarioId, { esPrincipal: true }, tx);
      }
    }
  });
}

module.exports = {
  listar,
  crear,
  actualizar,
  marcarPrincipal,
  eliminar,
  DireccionNoEncontradaError,
};
