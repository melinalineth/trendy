// backend/src/services/pedido.service.js
//
// Sprint 4 / MOD-06 y MOD-05 (DDS §3): pedidos.
//   - Creación a partir del carrito con el alta de InfoEnvio (RF-030, RF-027).
//   - Cancelación con reposición de stock y cancelación de vencidos.
//   - Consulta y gestión del estado (RF-031, RF-032).
//   - Estado de envío y seguimiento (RF-028, RF-029).
// Reglas de estados e invariantes: docs/diseno/pedidos-estados.md.
//
// Los errores de dominio llevan `status` y `codigo` en la propia clase:
// errorHandler.js los formatea como { error: { codigo, mensaje, detalles } }
// (DDS §5.3) sin tener que registrarlos (mismo criterio que pago.service e
// inventario). Los que ya existen se REUTILIZAN en vez de duplicarse:
//   - StockInsuficienteError de inventario (409, detalles { varianteId,
//     disponible }), que es la que lanza descontarPorPedido.
//   - CoberturaNoDisponibleError y DireccionNoAutorizadaError de envío
//     (errorHandler las mapea a 409 SIN_COBERTURA y 404
//     DIRECCION_NO_ENCONTRADA).
//   - PedidoNoEncontradoError y ContraEntregaNoDisponibleError de pagos.
//
// Montos: SIEMPRE en centavos enteros (sin errores de coma flotante) y se
// guardan como Decimal(10,2) con dos decimales exactos.

const prisma = require("../config/prisma");
const pedidoRepository = require("../repositories/pedido.repository");
const pagoRepository = require("../repositories/pago.repository");
const carritoRepository = require("../repositories/carrito.repository");
const direccionRepository = require("../repositories/direccion.repository");
const zonaCoberturaRepository = require("../repositories/zonaCobertura.repository");
const envioService = require("./envio.service");
const ventaService = require("./venta.service");
const inventarioService = require("./inventario.service");
const {
  PedidoNoEncontradoError,
  ContraEntregaNoDisponibleError,
  horasDeVigenciaPreferencia,
} = require("./pago.service");

const envioRepository = require("../repositories/envio.repository");

const {
  CoberturaNoDisponibleError,
  DireccionNoAutorizadaError,
  TransicionEnvioInvalidaError,
  ESTADOS_ENVIO,
} = envioService;
const { StockInsuficienteError } = inventarioService;

// RF-030: el carrito no tiene líneas (o el usuario nunca tuvo carrito). Es
// también lo que recibe la segunda de dos creaciones simultáneas desde el
// mismo carrito: la primera ya lo vació.
class CarritoVacioError extends Error {
  constructor(message = "El carrito está vacío: agregá productos antes de crear el pedido") {
    super(message);
    this.name = "CarritoVacioError";
    this.status = 409;
    this.codigo = "CARRITO_VACIO";
  }
}

// RN-001: un producto inactivo no se puede vender aunque siga en el carrito.
class ProductoNoDisponibleError extends Error {
  constructor(varianteId) {
    super("Un producto del carrito ya no está disponible para la venta");
    this.name = "ProductoNoDisponibleError";
    this.status = 409;
    this.codigo = "PRODUCTO_NO_DISPONIBLE";
    this.detalles = { varianteId };
  }
}

// Cancelación rechazada: el pedido ya avanzó (confirmado, en envío...) o
// tiene un Pago APROBADO (el reembolso es manual, fuera del sistema).
class PedidoNoCancelableError extends Error {
  constructor(message = "El pedido no se puede cancelar en su estado actual", detalles = null) {
    super(message);
    this.name = "PedidoNoCancelableError";
    this.status = 409;
    this.codigo = "PEDIDO_NO_CANCELABLE";
    this.detalles = detalles;
  }
}

// Cambio de EstadoPedido que la tabla de transiciones no permite (salto,
// retroceso, mismo estado, estados de pago o CANCELADO a mano).
class TransicionEstadoInvalidaError extends Error {
  constructor(message) {
    super(message);
    this.name = "TransicionEstadoInvalidaError";
    this.status = 409;
    this.codigo = "TRANSICION_ESTADO_INVALIDA";
  }
}

// El pedido no tiene InfoEnvio (los creados por POST /pedidos siempre lo
// tienen; solo puede faltar en datos cargados a mano). 409 al intentar mover
// el envío, 404 al consultar el seguimiento.
class EnvioNoRegistradoError extends Error {
  constructor(status = 409) {
    super("El pedido no tiene información de envío registrada");
    this.name = "EnvioNoRegistradoError";
    this.status = status;
    this.codigo = "ENVIO_NO_REGISTRADO";
  }
}

// El total no entra en Decimal(10,2) (99.999.999,99).
class MontoFueraDeRangoError extends Error {
  constructor(message = "El total del pedido supera el máximo permitido") {
    super(message);
    this.name = "MontoFueraDeRangoError";
    this.status = 409;
    this.codigo = "MONTO_FUERA_DE_RANGO";
  }
}

// Regla "COP en pesos enteros" (docs/diseno/montos-cop.md): un pedido de
// Mercado Pago no puede llevar centavos (en una línea o en el envío) porque
// la pasarela solo acepta montos enteros. Mismo código que pago.service
// (crearPreferencia) para que el frontend lo reconozca; acá se detecta ANTES de
// reservar stock, así el cliente no queda con un pedido impagable.
class MontoNoEnteroCopError extends Error {
  constructor(message, detalles = null) {
    super(message);
    this.name = "MontoNoEnteroCopError";
    this.status = 409;
    this.codigo = "MONTO_NO_ENTERO_COP";
    this.detalles = detalles;
  }
}

// ---------------------------------------------------------------------------
// Montos en centavos
// ---------------------------------------------------------------------------

const CENTAVOS_MAXIMOS = 9999999999; // Decimal(10,2)

// Decimal de Prisma, string o Number (p. ej. el costo de calcularCosto) ->
// centavos enteros. Se parsea el TEXTO con dos decimales (Decimal.toFixed(2))
// en vez de multiplicar floats: "0.10" * 3 da 30 centavos exactos.
function aCentavos(valor) {
  const texto =
    valor !== null && typeof valor === "object" && typeof valor.toFixed === "function"
      ? valor.toFixed(2)
      : String(valor).trim();
  const partes = /^(\d+)(?:\.(\d{1,2}))?$/.exec(texto);

  if (!partes) {
    throw new Error(`Monto inválido: ${texto}`);
  }

  return Number(partes[1]) * 100 + Number((partes[2] ?? "").padEnd(2, "0"));
}

// Centavos enteros -> string con dos decimales exactos para Decimal(10,2).
function deCentavos(centavos) {
  return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, "0")}`;
}

// Decimal -> Number para la respuesta JSON (Prisma serializa Decimal como
// string). Con dos decimales y montos dentro de Decimal(10,2) es exacto.
const aNumero = (valor) => (valor === null || valor === undefined ? valor : Number(valor));

// ---------------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------------

function presentarDetalle(detalle) {
  return {
    id: detalle.id,
    varianteId: detalle.varianteId,
    cantidad: detalle.cantidad,
    // RN-008: precio HISTÓRICO de la línea, no el vigente del producto.
    precioUnitario: aNumero(detalle.precioUnitario),
    subtotal: aCentavos(detalle.precioUnitario) * detalle.cantidad / 100,
    ...(detalle.variante ? { variante: detalle.variante } : {}),
  };
}

function presentarInfoEnvio(info) {
  if (!info) return null;

  return {
    id: info.id,
    direccionId: info.direccionId,
    costoEnvio: aNumero(info.costoEnvio),
    estadoEnvio: info.estadoEnvio,
    actualizadoEn: info.actualizadoEn,
  };
}

function presentarPago(pago) {
  if (!pago) return null;

  return {
    id: pago.id,
    metodo: pago.metodo,
    estado: pago.estado,
    monto: aNumero(pago.monto),
    referenciaExterna: pago.referenciaExterna,
    actualizadoEn: pago.actualizadoEn,
  };
}

// Forma pública de un pedido: montos como Number y solo las relaciones que
// vinieron cargadas.
function presentarPedido(pedido) {
  return {
    id: pedido.id,
    numero: pedido.numero,
    usuarioId: pedido.usuarioId,
    estado: pedido.estado,
    metodoPago: pedido.metodoPago,
    direccionId: pedido.direccionId,
    subtotal: aNumero(pedido.subtotal),
    costoEnvio: aNumero(pedido.costoEnvio),
    total: aNumero(pedido.total),
    creadoEn: pedido.creadoEn,
    ...(pedido.usuario ? { usuario: pedido.usuario } : {}),
    ...(pedido.direccion !== undefined ? { direccion: pedido.direccion } : {}),
    detalles: (pedido.detalles ?? []).map(presentarDetalle),
    ...(pedido.infoEnvio !== undefined ? { infoEnvio: presentarInfoEnvio(pedido.infoEnvio) } : {}),
    ...(pedido.pago !== undefined ? { pago: presentarPago(pedido.pago) } : {}),
  };
}

// ---------------------------------------------------------------------------
// Creación (RF-030, RF-027)
// ---------------------------------------------------------------------------

// Opciones de las transacciones interactivas: varias creaciones del mismo
// carrito esperan su turno en el lock, así que se da margen al timeout por
// defecto de Prisma (5 s).
const OPCIONES_TRANSACCION = Object.freeze({ maxWait: 10000, timeout: 15000 });

// Reintentos de una transacción completa (máximo INTENTOS_TRANSACCION):
//   - Deadlock / conflicto de escritura (P2034, o P2010 con MySQL 1213 en SQL
//     crudo) y lock wait timeout (MySQL 1205): la transacción completa se
//     revierte (MySQL a la víctima del deadlock; Prisma hace ROLLBACK porque
//     el callback lanzó), así que repetirla es seguro; la idempotencia sale
//     de los locks y del estado leído bajo ellos. Es lo que recomienda
//     Prisma. Pasa con cualquier carga concurrente.
//   - P2002 solo al crear y solo si es el unique de Pedido.numero
//     (generarNumero puede repetirse: mismo ms y mismo aleatorio).
// Ver esErrorReintentable.
// Cada reintento deja una línea JSON (TRANSACCION_REINTENTADA): si aparecen
// seguido, hay un problema de orden de locks que mirar.
const INTENTOS_TRANSACCION = 3;

// Códigos de MySQL que abortan la transacción por concurrencia: 1213
// (deadlock) y 1205 (lock wait timeout). Dentro de un $queryRaw (los SELECT
// ... FOR UPDATE de bloquearPedido / bloquearPorUsuario) Prisma NO los
// traduce a P2034: llegan como P2010 con el código en
// meta.driverAdapterError.cause.originalCode y en el mensaje
// ("Raw query failed. Code: `1213`").
const CODIGOS_MYSQL_REINTENTABLES = Object.freeze(["1213", "1205"]);

// Índice único de Pedido.numero (generarNumero puede repetirse).
const INDICE_NUMERO_PEDIDO = "Pedido_numero_key";

function codigoMysqlDeSqlCrudo(error) {
  const codigo = error?.meta?.driverAdapterError?.cause?.originalCode;
  if (codigo !== undefined && codigo !== null) return String(codigo);

  const coincidencia = /Code: `(\d+)`/.exec(String(error?.message ?? ""));
  return coincidencia ? coincidencia[1] : null;
}

// ¿El P2002 es el unique de Pedido.numero? Con el adapter de MariaDB el
// índice viene en meta.driverAdapterError.cause.constraint (sin
// meta.target); sin adapter, en meta.target (campos o nombre del índice).
function esUniqueDeNumero(error) {
  const meta = error?.meta ?? {};
  const restriccion = meta.driverAdapterError?.cause?.constraint ?? {};
  const candidatos = [
    ...[meta.target].flat(),
    restriccion.index,
    ...[restriccion.fields].flat(),
  ].filter((valor) => typeof valor === "string");

  return candidatos.some((valor) => valor === "numero" || valor === INDICE_NUMERO_PEDIDO);
}

/**
 * ¿Se puede repetir la transacción completa? Función pura (exportada para
 * testearla con errores simulados):
 *   - P2034: deadlock / conflicto de escritura de una query de Prisma.
 *   - P2010 con código MySQL 1213 o 1205: lo mismo dentro de SQL crudo.
 *   - P2002 del unique de Pedido.numero, solo si `reintentarUnique` (al
 *     crear); cualquier otro unique es un error real.
 */
function esErrorReintentable(error, { reintentarUnique = false } = {}) {
  if (!error) return false;

  if (error.code === "P2034") return true;

  if (error.code === "P2010") {
    return CODIGOS_MYSQL_REINTENTABLES.includes(codigoMysqlDeSqlCrudo(error));
  }

  if (error.code === "P2002") {
    return reintentarUnique && esUniqueDeNumero(error);
  }

  return false;
}

async function enTransaccion(operacion, fn, { reintentarUnique = false } = {}) {
  for (let intento = 1; ; intento++) {
    try {
      return await prisma.$transaction(fn, OPCIONES_TRANSACCION);
    } catch (error) {
      const reintentable = esErrorReintentable(error, { reintentarUnique });

      if (!reintentable || intento >= INTENTOS_TRANSACCION) {
        throw error;
      }

      logEvento({ evento: "TRANSACCION_REINTENTADA", operacion, intento, codigo: error.code });
      // Espera corta y aleatoria para que los dos lados no choquen de nuevo.
      await new Promise((resolver) => setTimeout(resolver, 10 * intento + Math.random() * 20));
    }
  }
}

// Un pedido de Mercado Pago exige pesos enteros en cada línea y en el envío
// (centavos % 100 === 0). Función pura sobre datos ya leídos bajo el lock del
// carrito: no consulta ni escribe nada, así que rechazar acá no deja efectos
// (ni pedido, ni descuento de stock, ni cambios en el carrito).
// Contra entrega NO pasa por acá a propósito: ese pago no viaja a la pasarela
// y los precios con centavos de datos legacy siguen siendo vendibles así
// (de hecho es la salida para esos clientes).
function exigirMontosEnterosParaMercadoPago(items, lineas, costoEnvioCentavos) {
  const indiceConCentavos = lineas.findIndex((linea) => linea.precioCentavos % 100 !== 0);

  if (indiceConCentavos !== -1) {
    const item = items[indiceConCentavos];
    const nombre = item.variante.producto.nombre;

    throw new MontoNoEnteroCopError(
      `El precio de "${nombre}" tiene centavos y no se puede pagar con Mercado Pago: ` +
        "Mercado Pago solo acepta montos enteros en pesos (COP)",
      { varianteId: item.varianteId }
    );
  }

  if (costoEnvioCentavos % 100 !== 0) {
    throw new MontoNoEnteroCopError(
      "El costo de envío tiene centavos y no se puede pagar con Mercado Pago: " +
        "Mercado Pago solo acepta montos enteros en pesos (COP)",
      { concepto: "costoEnvio" }
    );
  }
}

// Todo lo que pasa con el lock del carrito tomado. Devuelve el id del pedido.
// Orden de escritura pensado para no provocar deadlocks entre pedidos
// simultáneos que comparten variantes: el Pedido primero (sin líneas), luego
// el descuento de stock (lock EXCLUSIVO de cada variante, en orden de id) y
// recién después las líneas (cuya FK pide un lock compartido sobre la
// variante, que esta transacción ya tiene en exclusivo). Insertar las líneas
// antes del descuento haría que dos transacciones tomen el compartido y
// después ambas pidan el exclusivo.
async function crearEnTransaccion(tx, { usuarioId, direccionId, metodoPago, costoEnvioCentavos }) {
  // 1. Lock del carrito: dos creaciones simultáneas desde el mismo carrito
  //    se serializan; la segunda ve el carrito ya vaciado (CARRITO_VACIO).
  const carrito = await carritoRepository.bloquearPorUsuario(usuarioId, tx);

  if (!carrito) {
    throw new CarritoVacioError();
  }

  const conItems = await carritoRepository.obtenerConItems(carrito.id, tx);
  const items = conItems?.items ?? [];

  if (items.length === 0) {
    throw new CarritoVacioError();
  }

  // 2. RN-001: todos los productos siguen activos.
  const inactivo = items.find((item) => item.variante?.producto?.estado !== "ACTIVO");
  if (inactivo) {
    throw new ProductoNoDisponibleError(inactivo.varianteId);
  }

  // 3. RN-008: el precio de cada línea se copia del precio VIGENTE ahora y
  //    queda congelado en DetallePedido.precioUnitario.
  const lineas = items.map((item) => ({
    varianteId: item.varianteId,
    cantidad: item.cantidad,
    precioCentavos: aCentavos(item.variante.producto.precio),
  }));

  // 3b. Mercado Pago solo acepta pesos enteros: se corta ANTES de escribir
  //     nada (el pedido, el descuento de stock y el vaciado del carrito vienen
  //     después), con los precios que ya se leyeron bajo el lock del carrito.
  if (metodoPago === "MERCADO_PAGO") {
    exigirMontosEnterosParaMercadoPago(items, lineas, costoEnvioCentavos);
  }

  const subtotal = lineas.reduce((suma, l) => suma + l.precioCentavos * l.cantidad, 0);
  const total = subtotal + costoEnvioCentavos;

  if (total > CENTAVOS_MAXIMOS) {
    throw new MontoFueraDeRangoError();
  }

  const pedido = await pedidoRepository.crear(
    {
      usuarioId,
      direccionId,
      metodoPago,
      subtotal: deCentavos(subtotal),
      costoEnvio: deCentavos(costoEnvioCentavos),
      total: deCentavos(total),
    },
    tx
  );

  // 4. RN-002 / RN-007: descuento atómico con el cliente `tx` (nunca el
  //    prisma raíz): si una línea no alcanza lanza StockInsuficienteError y
  //    se revierte TODO (pedido, descuentos previos, InfoEnvio y carrito).
  //    Desde acá el stock queda RESERVADO para este pedido (pago.service
  //    asume que ya se descontó).
  await inventarioService.descontarPorPedido(
    lineas.map(({ varianteId, cantidad }) => ({ varianteId, cantidad })),
    { usuarioId, pedidoId: pedido.id, tx }
  );

  await pedidoRepository.crearDetalles(
    pedido.id,
    lineas.map(({ varianteId, cantidad, precioCentavos }) => ({
      varianteId,
      cantidad,
      precioUnitario: deCentavos(precioCentavos),
    })),
    tx
  );

  // 5. RF-027: InfoEnvio con la dirección y el costo congelados, en
  //    EN_PREPARACION (docs/diseno/info-envio.md).
  //    Su primera fila de historial (null -> EN_PREPARACION) la hace el cliente
  //    que crea el pedido (RF-028, RF-029).
  await envioService.crearInfoEnvio(
    { pedidoId: pedido.id, direccionId, costoEnvio: deCentavos(costoEnvioCentavos), usuarioId },
    tx
  );

  // 6. El carrito queda vacío (el carrito en sí se conserva).
  await carritoRepository.vaciar(carrito.id, tx);

  return pedido.id;
}

/**
 * RF-030: crea un pedido PENDIENTE a partir del carrito del cliente.
 *
 * Fuera de la transacción (no necesitan el lock y así la transacción no pide
 * una segunda conexión del pool mientras retiene la suya): dirección propia
 * (RN-003, ajena -> 404), cobertura y tarifa (409 SIN_COBERTURA) y contra
 * entrega habilitada en la zona (RN-006). Dentro de UNA transacción, con el
 * carrito bloqueado: carrito no vacío, productos activos, precios vigentes,
 * pedido, descuento de stock, líneas, InfoEnvio y vaciado del carrito.
 */
async function crearPedido(usuarioId, { direccionId, metodoPago }) {
  const idUsuario = Number(usuarioId);

  const direccion = await direccionRepository.obtenerPorId(direccionId, idUsuario);
  if (!direccion) {
    throw new DireccionNoAutorizadaError("La dirección no existe o no pertenece al usuario");
  }

  const envio = await envioService.calcularCosto(direccionId, idUsuario);

  if (metodoPago === "CONTRA_ENTREGA") {
    const zona = await zonaCoberturaRepository.obtenerZona(envio.zonaId);
    if (!zona || zona.permiteContraEntrega !== true) {
      throw new ContraEntregaNoDisponibleError(
        "El pago contra entrega no está disponible para la zona de esta dirección"
      );
    }
  }

  const datos = {
    usuarioId: idUsuario,
    direccionId,
    metodoPago,
    costoEnvioCentavos: aCentavos(envio.costo),
  };

  const pedidoId = await enTransaccion("CREAR_PEDIDO", (tx) => crearEnTransaccion(tx, datos), {
    reintentarUnique: true,
  });

  return presentarPedido(await pedidoRepository.obtenerPorId(pedidoId));
}

// ---------------------------------------------------------------------------
// Cancelación y pedidos vencidos (ERS RF-019 "un pedido cancelado liberará el
// stock", RF-033)
// ---------------------------------------------------------------------------

const ROLES_PERSONAL = Object.freeze(["admin", "vendedor"]);
const esPersonal = (usuario) => ROLES_PERSONAL.includes(usuario?.rol);

// Estados desde los que se puede cancelar CUALQUIER pedido (el stock sigue
// reservado y no hubo pago aprobado). PAGO_PENDIENTE / PAGO_RECHAZADO son
// legados del enum: el flujo vigente no los produce, pero si existieran se
// cancelan igual.
const ESTADOS_CANCELABLES = Object.freeze(["PENDIENTE", "PAGO_PENDIENTE", "PAGO_RECHAZADO"]);

// Además, un pedido CONTRA_ENTREGA ya confirmado se puede cancelar mientras no
// se haya entregado (caso típico: el cliente lo rechaza en la puerta). Decisión
// de producto: "un pedido contra entrega se puede anular". ENTREGADO queda
// fuera (ya se entregó y se cobró). Un pedido de MERCADO_PAGO confirmado NO se
// cancela por esta vía: ya está pagado y el reembolso queda fuera de alcance
// (docs/diseno/pedidos-estados.md §6). Estos son los mismos estados de
// ESTADOS_QUE_CUENTAN de venta.service salvo ENTREGADO: cancelar uno de ellos
// anula la venta.
const ESTADOS_CANCELABLES_CONTRA_ENTREGA = Object.freeze([
  "CONFIRMADO",
  "EN_PREPARACION",
  "ENVIADO",
  "EN_TRANSITO",
]);

/**
 * ¿Se puede cancelar un pedido en `estado` con ese método de pago? Función
 * pura (sin mirar el Pago: el Pago APROBADO lo rechaza cancelarBajoLock aparte).
 */
function esCancelable(estado, metodoPago) {
  return (
    ESTADOS_CANCELABLES.includes(estado) ||
    (metodoPago === "CONTRA_ENTREGA" && ESTADOS_CANCELABLES_CONTRA_ENTREGA.includes(estado))
  );
}

// Mensaje de un 409 por estado no cancelable, según el motivo.
function mensajeNoCancelable(estado, metodoPago) {
  if (estado === "ENTREGADO") {
    return "No se puede cancelar un pedido ya entregado";
  }

  if (metodoPago === "MERCADO_PAGO" && ventaService.ESTADOS_QUE_CUENTAN.includes(estado)) {
    return (
      `No se puede cancelar un pedido de Mercado Pago en estado ${estado}: ya está pagado y el ` +
      "reembolso queda fuera del sistema (se gestiona manualmente)"
    );
  }

  return `No se puede cancelar un pedido en estado ${estado}; solo se cancelan pedidos pendientes de pago ` +
    "o pedidos contra entrega que todavía no se entregaron";
}

const MOTIVO_CANCELACION = "Pedido cancelado";
const MOTIVO_VENCIMIENTO = "Pedido cancelado por vencimiento del pago";
const HORA_MS = 60 * 60 * 1000;

// Log estructurado: JSON de UNA línea (mismo formato que pago.service) para
// poder filtrarlo y reconciliar a mano.
function logEvento(evento) {
  console.error(JSON.stringify(evento));
}

// Núcleo de la cancelación, dentro de una transacción y con el lock del
// pedido tomado. La idempotencia sale del ESTADO leído bajo el lock (un
// pedido ya CANCELADO no se repone de nuevo), porque reponerPorPedido NO es
// idempotente. Lo comparten la cancelación manual y la de vencidos, así que
// una cancelación, un vencimiento y un webhook "approved" simultáneos sobre
// el mismo pedido se serializan en la misma fila. Solo la usa el personal
// (PATCH /cancelar es admin/vendedor) y el proceso de vencidos.
//   - vencimiento: { corte } para la cancelación de vencidos. Si al tomar el
//     lock el pedido ya no cumple las condiciones (lo pagaron, lo cancelaron,
//     cambió de estado) se OMITE en vez de fallar. Vencidos solo cancela
//     pedidos PENDIENTE, que nunca tuvieron venta: no toca ventas.
//   - anuladaPorId: quien cancela (y por lo tanto anula la venta, RF-041); se
//     guarda en Venta.anuladaPorId. NO es Venta.responsableId (quien la registró).
// Si el pedido estaba confirmado (contra entrega), su venta se ANULA en la
// misma transacción; el InfoEnvio y su historial NO se tocan (quedan como
// registro de lo ocurrido. Devuelve { yaCancelado, ventaAnulada, ventaFaltante,
// estado } o { omitido: true }: `ventaFaltante` es que el pedido contaba como
// venta (estaba confirmado) y la anulación no encontró ninguna REGISTRADA.
async function cancelarBajoLock(tx, pedidoId, { motivo, vencimiento = null, anuladaPorId = null }) {
  const bloqueado = await pedidoRepository.bloquearPedido(pedidoId, tx);

  if (!bloqueado) {
    if (vencimiento) return { omitido: true };
    throw new PedidoNoEncontradoError();
  }

  if (bloqueado.estado === "CANCELADO") {
    return vencimiento ? { omitido: true } : { yaCancelado: true };
  }

  const pago = await pagoRepository.buscarPorPedido(pedidoId, tx);

  if (vencimiento) {
    const sigueVencido =
      bloqueado.estado === "PENDIENTE" &&
      bloqueado.metodoPago === "MERCADO_PAGO" &&
      new Date(bloqueado.creadoEn) < vencimiento.corte &&
      pago?.estado !== "APROBADO";

    if (!sigueVencido) return { omitido: true };
  }

  if (pago?.estado === "APROBADO") {
    // Dinero cobrado: no se cancela acá; el reembolso es manual.
    logEvento({ evento: "CANCELACION_RECHAZADA_CON_PAGO_APROBADO", pedidoId });
    throw new PedidoNoCancelableError(
      "El pedido tiene un pago aprobado: no se puede cancelar desde el sistema (el reembolso se gestiona manualmente)",
      { estado: bloqueado.estado, metodoPago: bloqueado.metodoPago, motivo: "PAGO_APROBADO" }
    );
  }

  if (!esCancelable(bloqueado.estado, bloqueado.metodoPago)) {
    throw new PedidoNoCancelableError(mensajeNoCancelable(bloqueado.estado, bloqueado.metodoPago), {
      estado: bloqueado.estado,
      metodoPago: bloqueado.metodoPago,
      motivo: "ESTADO_NO_CANCELABLE",
    });
  }

  const lineas = await pedidoRepository.obtenerLineas(pedidoId, tx);

  await pedidoRepository.actualizarEstado(pedidoId, "CANCELADO", tx);

  // Un pago contra entrega registrado (PENDIENTE) ya no se va a cobrar. Un
  // intento RECHAZADO de Mercado Pago queda como está (es historia del pago).
  if (pago?.estado === "PENDIENTE") {
    await pagoRepository.actualizarEstado(pedidoId, "CANCELADO", undefined, tx);
  }

  // El stock estaba reservado desde la creación: se libera con el usuario
  // DUEÑO del pedido (InventarioMovimiento.usuarioId), quien sea que cancele.
  if (lineas.length > 0) {
    await inventarioService.reponerPorPedido(lineas, {
      usuarioId: Number(bloqueado.usuarioId),
      pedidoId,
      motivo,
      tx,
    });
  }

  // RF-041: un pedido confirmado tenía venta; se anula (nunca se borra) en esta
  // misma transacción. Un pedido pendiente nunca tuvo venta: no se toca.
  let ventaAnulada = false;
  let ventaFaltante = false;
  if (ventaService.ESTADOS_QUE_CUENTAN.includes(bloqueado.estado)) {
    ({ anulada: ventaAnulada } = await ventaService.anularVentaDePedido(
      pedidoId,
      { anuladaPorId },
      tx
    ));
    ventaFaltante = !ventaAnulada;
  }

  return { yaCancelado: false, ventaAnulada, ventaFaltante, estado: bloqueado.estado };
}

/**
 * PATCH /api/v1/pedidos/:id/cancelar: SOLO admin y vendedor (ERS v1.2 §2.8.3
 * y matriz §4.1: en el MVP la cancelación la gestiona el personal a pedido
 * del cliente; RF-033, cancelación por el propio cliente, es v2.0). El rol lo
 * restringe roleGuard. Se cancelan los pedidos pendientes de pago y, solo si son
 * CONTRA_ENTREGA, los confirmados que todavía no se entregaron (CONFIRMADO,
 * EN_PREPARACION, ENVIADO, EN_TRANSITO): repone el stock y ANULA la venta en la
 * misma transacción. Nunca con un Pago APROBADO (409). Repetirlo responde 200
 * { yaCancelado: true } sin reponer ni anular otra vez.
 *
 * `usuario` es quien cancela (admin o vendedor): queda en Venta.anuladaPorId
 * (durable, en la misma transacción) y en el log VENTA_ANULADA.
 */
async function cancelarPedido(pedidoId, usuario) {
  const anuladaPorId = usuario?.id === undefined ? null : Number(usuario.id);

  const { yaCancelado, ventaAnulada, ventaFaltante, estado } = await enTransaccion(
    "CANCELAR_PEDIDO",
    (tx) => cancelarBajoLock(tx, pedidoId, { motivo: MOTIVO_CANCELACION, anuladaPorId })
  );

  // Recién con la transacción confirmada: un log antes del commit podría
  // describir una anulación que después se revierte.
  if (ventaAnulada) {
    logEvento({ evento: "VENTA_ANULADA", pedidoId, anuladaPorId });
  }

  // Un pedido confirmado SIN venta (el hueco de pedidos-estados.md §9) se
  // cancela igual, pero la cancelación no puede pasar sin dejar rastro de que no
  // había venta que anular: queda para reconciliar a mano.
  if (ventaFaltante) {
    // La clave `responsableId` (quien canceló) se conserva: es el contrato de
    // este log y no hay venta donde guardar nada.
    logEvento({
      evento: "VENTA_NO_ENCONTRADA_AL_CANCELAR",
      pedidoId,
      estado,
      responsableId: anuladaPorId,
    });
  }

  return {
    yaCancelado,
    pedido: presentarPedido(await pedidoRepository.obtenerPorId(pedidoId)),
  };
}

// Margen sobre la vigencia de pago antes de cancelar un pedido por vencido.
// pago.service no emite preferencias que vivan más allá de creadoEn + horas;
// el margen cubre el desfase de reloj con Mercado Pago y un pago que se
// acredita justo al límite.
const MARGEN_VENCIMIENTO_MS = 15 * 60 * 1000;

/**
 * Cancela (con reposición) los pedidos MERCADO_PAGO en PENDIENTE creados hace
 * más de `horas` horas + MARGEN_VENCIMIENTO_MS y sin Pago APROBADO. Los
 * CONTRA_ENTREGA no vencen (se pagan al recibir). Cada pedido va en su propia
 * transacción y bajo su lock, donde se vuelve a validar todo.
 *
 * `horas` es un PISO, no un reemplazo: la vigencia efectiva es
 * max(horas, vigencia configurada), con la vigencia configurada =
 * MERCADOPAGO_PREFERENCIA_HORAS (mismo parseo que pago.service; 24 si falta o
 * es inválida). Así un `horas` menor nunca cancela un pedido cuya preferencia
 * de pago todavía está viva (pago.service la limita a creadoEn + vigencia).
 * No hay cron: lo invoca un scheduler externo vía
 * POST /api/v1/pedidos/vencidos/cancelar.
 */
async function cancelarPedidosVencidos({ horas } = {}) {
  const vigencia = horasDeVigenciaPreferencia();
  const horasEfectivas = Math.max(horas ?? vigencia, vigencia);
  const corte = new Date(Date.now() - horasEfectivas * HORA_MS - MARGEN_VENCIMIENTO_MS);
  const candidatos = await pedidoRepository.listarIdsVencidos(corte);

  const cancelados = [];
  const omitidos = [];

  for (const pedidoId of candidatos) {
    try {
      const resultado = await enTransaccion("CANCELAR_VENCIDO", (tx) =>
        cancelarBajoLock(tx, pedidoId, {
          motivo: MOTIVO_VENCIMIENTO,
          vencimiento: { corte },
        })
      );
      (resultado.omitido ? omitidos : cancelados).push(pedidoId);
    } catch (error) {
      // Un pedido que falla no frena al resto; queda en el log para revisarlo.
      logEvento({ evento: "CANCELACION_VENCIDO_FALLIDA", pedidoId, mensaje: error.message });
      omitidos.push(pedidoId);
    }
  }

  return { horas: horasEfectivas, corte, cancelados, omitidos };
}

// ---------------------------------------------------------------------------
// Consulta (RF-031, RF-032)
// ---------------------------------------------------------------------------

// Colombia no tiene horario de verano: America/Bogota es UTC-5 todo el año.
const DESFASE_BOGOTA_HORAS = 5;

// 'AAAA-MM-DD' (ya validada por el DTO) -> instante en que empieza ese día en
// Bogotá (+ diasExtra días).
function inicioDelDiaEnBogota(texto, diasExtra = 0) {
  const [anio, mes, dia] = texto.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + diasExtra, DESFASE_BOGOTA_HORAS));
}

const LIMITE_POR_DEFECTO = 20;

/**
 * GET /api/v1/pedidos. Cliente: SOLO los suyos (el usuarioId de la query se
 * ignora: sale de la sesión, RN-003). Admin y vendedor: todos, con filtros
 * por cliente, número, estado y fechas (RF-032). `desde`/`hasta` son días
 * calendario en America/Bogota y `hasta` es inclusivo. Más recientes
 * primero, paginado.
 */
async function listarPedidos(usuario, filtros = {}) {
  const pagina = filtros.pagina ?? 1;
  const limite = filtros.limite ?? LIMITE_POR_DEFECTO;

  const consulta = {
    estado: filtros.estado,
    numero: filtros.numero,
    desde: filtros.desde ? inicioDelDiaEnBogota(filtros.desde) : undefined,
    hasta: filtros.hasta ? inicioDelDiaEnBogota(filtros.hasta, 1) : undefined,
    skip: (pagina - 1) * limite,
    take: limite,
  };

  const { pedidos, total } = esPersonal(usuario)
    ? await pedidoRepository.listarTodos({ ...consulta, usuarioId: filtros.usuarioId })
    : await pedidoRepository.listarPorUsuario(Number(usuario.id), consulta);

  return {
    pedidos: pedidos.map(presentarPedido),
    paginacion: { pagina, limite, total, totalPaginas: Math.ceil(total / limite) },
  };
}

// Pedido completo visible para `usuario` o PedidoNoEncontradoError (uno
// ajeno responde igual que uno inexistente, RN-003 / DDS §5.2).
async function obtenerVisible(pedidoId, usuario, client = prisma) {
  const pedido = await pedidoRepository.obtenerPorId(pedidoId, client);

  if (!pedido || (!esPersonal(usuario) && Number(pedido.usuarioId) !== Number(usuario.id))) {
    throw new PedidoNoEncontradoError();
  }

  return pedido;
}

/**
 * GET /api/v1/pedidos/:id: detalle con líneas (precio HISTÓRICO, RN-008),
 * pago, InfoEnvio y dirección. Dueño, admin y vendedor.
 */
async function obtenerPedidoPorId(pedidoId, usuario) {
  return presentarPedido(await obtenerVisible(pedidoId, usuario));
}

// ---------------------------------------------------------------------------
// Gestión del estado (RF-032) y su sincronización con el envío (RF-029)
// ---------------------------------------------------------------------------

// Transiciones MANUALES de EstadoPedido (PATCH /estado), ERS §4.2. Ver
// docs/diseno/pedidos-estados.md. Lineales y hacia adelante, sin saltos.
//   - PENDIENTE -> CONFIRMADO: solo contra entrega con su Pago registrado (un
//     pedido de Mercado Pago lo confirma el webhook al aprobarse el pago).
//   - PAGO_APROBADO -> CONFIRMADO: el webhook ya lo hace en la misma
//     transacción; queda por si un pedido quedara a mitad de camino.
//   - CANCELADO: solo por PATCH /cancelar (repone el stock).
//   - PENDIENTE y los estados de pago: solo los fija pago.service.
const TRANSICIONES_PEDIDO = Object.freeze({
  PENDIENTE: Object.freeze(["CONFIRMADO"]),
  PAGO_APROBADO: Object.freeze(["CONFIRMADO"]),
  CONFIRMADO: Object.freeze(["EN_PREPARACION"]),
  EN_PREPARACION: Object.freeze(["ENVIADO"]),
  ENVIADO: Object.freeze(["EN_TRANSITO"]),
  EN_TRANSITO: Object.freeze(["ENTREGADO"]),
  ENTREGADO: Object.freeze([]),
  CANCELADO: Object.freeze([]),
  PAGO_RECHAZADO: Object.freeze([]),
  PAGO_PENDIENTE: Object.freeze([]),
});

const ESTADOS_DE_PAGO = Object.freeze(["PENDIENTE", "PAGO_APROBADO", "PAGO_RECHAZADO", "PAGO_PENDIENTE"]);

/**
 * Valida un cambio manual de EstadoPedido. Función pura: `pago` es el Pago
 * del pedido (o null). Lanza TransicionEstadoInvalidaError (409) si no se
 * permite; si se permite devuelve el estado nuevo.
 */
function validarTransicionPedido(estadoActual, estadoNuevo, { metodoPago, pago = null } = {}) {
  if (estadoNuevo === "CANCELADO") {
    throw new TransicionEstadoInvalidaError(
      "Para cancelar un pedido usá PATCH /api/v1/pedidos/:id/cancelar (libera el stock)"
    );
  }

  if (ESTADOS_DE_PAGO.includes(estadoNuevo)) {
    throw new TransicionEstadoInvalidaError(
      `El estado ${estadoNuevo} lo fija el flujo de pagos; no se puede asignar a mano`
    );
  }

  const destinos = Object.hasOwn(TRANSICIONES_PEDIDO, estadoActual)
    ? TRANSICIONES_PEDIDO[estadoActual]
    : [];

  if (!destinos.includes(estadoNuevo)) {
    throw new TransicionEstadoInvalidaError(
      `No se puede pasar el pedido de ${estadoActual} a ${estadoNuevo}` +
        (destinos.length > 0
          ? `; desde ${estadoActual} solo se puede pasar a ${destinos.join(", ")}`
          : `; ${estadoActual} no admite cambios manuales`)
    );
  }

  if (estadoActual === "PENDIENTE" && estadoNuevo === "CONFIRMADO") {
    if (metodoPago !== "CONTRA_ENTREGA") {
      throw new TransicionEstadoInvalidaError(
        "Un pedido de Mercado Pago se confirma solo cuando se aprueba su pago"
      );
    }
    if (!pago || pago.metodo !== "CONTRA_ENTREGA" || !["PENDIENTE", "APROBADO"].includes(pago.estado)) {
      throw new TransicionEstadoInvalidaError(
        "Antes de confirmar el pedido hay que registrar su pago contra entrega"
      );
    }
  }

  return estadoNuevo;
}

// Lleva InfoEnvio al estado de envío `estadoNuevo`, con el lock del pedido
// tomado (misma transacción que el cambio de Pedido.estado). EN_PREPARACION
// es el estado con el que nace el InfoEnvio: entrar en preparación no lo
// cambia (y no escribe historial), solo exige que siga ahí. El resto pasa por
// envioService.cambiarEstadoEnvio: validarTransicionEstado (sin saltos ni
// retrocesos, RF-029) y la fila de historial con `usuarioId`, quien hace el
// cambio (RF-028, RF-029).
async function sincronizarEnvio(tx, pedidoId, estadoNuevo, usuarioId) {
  const info = await envioRepository.obtenerInfoEnvio(pedidoId, tx);

  if (!info) {
    throw new EnvioNoRegistradoError();
  }

  if (estadoNuevo === "EN_PREPARACION") {
    if (info.estadoEnvio !== "EN_PREPARACION") {
      throw new TransicionEnvioInvalidaError(
        `El envío del pedido ya está en ${info.estadoEnvio}; no puede volver a EN_PREPARACION`
      );
    }
    return info;
  }

  return envioService.cambiarEstadoEnvio({ pedidoId, info, estadoNuevo, usuarioId }, tx);
}

/**
 * PATCH /api/v1/pedidos/:id/estado (admin y vendedor). Bajo el lock del
 * pedido: valida la transición y, si el estado nuevo es de envío, actualiza
 * InfoEnvio y su historial (con `usuario`, quien hace el cambio) en la MISMA
 * transacción (Pedido.estado manda; mientras el pedido está en
 * EN_PREPARACION..ENTREGADO, InfoEnvio.estadoEnvio vale lo mismo).
 *
 * RF-041: la venta nace cuando el pedido queda confirmado. TODA transición a
 * CONFIRMADO la registra (contra entrega desde PENDIENTE, o la salida del
 * estado legado PAGO_APROBADO; el webhook de Mercado Pago hace lo mismo en
 * pago.service), a nombre del usuario que la hace, en la misma transacción y
 * bajo el mismo lock: si el registro falla, el cambio de estado se revierte.
 * Es idempotente: si la venta ya existía no se duplica ni se cambia su
 * responsable. Las transiciones posteriores no tocan la venta.
 */
async function actualizarEstado(pedidoId, estadoNuevo, usuario) {
  await enTransaccion("ACTUALIZAR_ESTADO", async (tx) => {
    const bloqueado = await pedidoRepository.bloquearPedido(pedidoId, tx);

    if (!bloqueado) {
      throw new PedidoNoEncontradoError();
    }

    const pago = await pagoRepository.buscarPorPedido(pedidoId, tx);
    validarTransicionPedido(bloqueado.estado, estadoNuevo, { metodoPago: bloqueado.metodoPago, pago });

    if (ESTADOS_ENVIO.includes(estadoNuevo)) {
      await sincronizarEnvio(tx, pedidoId, estadoNuevo, Number(usuario.id));
    }

    await pedidoRepository.actualizarEstado(pedidoId, estadoNuevo, tx);

    if (estadoNuevo === "CONFIRMADO") {
      await ventaService.registrarVentaDePedido(pedidoId, { responsableId: Number(usuario.id) }, tx);
    }
  });

  return presentarPedido(await pedidoRepository.obtenerPorId(pedidoId));
}

// ---------------------------------------------------------------------------
// Envío y seguimiento (RF-027, RF-028, RF-029)
// ---------------------------------------------------------------------------

// Estados del pedido en los que el envío ya arrancó (InfoEnvio vale lo mismo).
const ESTADOS_PEDIDO_EN_ENVIO = ESTADOS_ENVIO;

// Forma de la respuesta de seguimiento. `estadoEnvio` solo describe la
// logística cuando el pedido está en un estado de envío; antes de eso vale el
// EN_PREPARACION del alta y manda `estadoPedido`. Si el pedido se canceló,
// InfoEnvio no se toca: conserva el último valor (puede ser ENVIADO o
// EN_TRANSITO en un contra entrega cancelado en camino) y también manda
// `estadoPedido` (CANCELADO).
// `historial` (RF-028): cambios de estado de envío, el más antiguo primero,
// con fecha y hora; viene de HistorialEstadoEnvio (docs/diseno/info-envio.md
// §5) y es [] en los envíos anteriores a esa tabla.
function presentarSeguimiento(pedido, historial) {
  const direccion = pedido.direccion;

  return {
    pedidoId: pedido.id,
    numero: pedido.numero,
    estadoPedido: pedido.estado,
    estadoEnvio: pedido.infoEnvio.estadoEnvio,
    actualizadoEn: pedido.infoEnvio.actualizadoEn,
    costoEnvio: aNumero(pedido.infoEnvio.costoEnvio),
    direccion: direccion
      ? {
          id: direccion.id,
          destinatario: direccion.destinatario,
          telefono: direccion.telefono,
          calle: direccion.calle,
          ciudad: direccion.ciudad,
          departamento: direccion.departamento,
          codigoPostal: direccion.codigoPostal,
          referencia: direccion.referencia,
        }
      : null,
    historial,
  };
}

// Historial para la respuesta. El usuario que hizo cada cambio (RF-029) lo ve
// SOLO el personal, y únicamente { id, nombre }: el cliente dueño ve estados y
// fechas, nunca la identidad de quien atiende su pedido, y a nadie se le
// expone correo ni datos sensibles (el repository no los selecciona).
async function cargarHistorial(infoEnvioId, usuario, client = prisma) {
  const conUsuario = esPersonal(usuario);
  const filas = await envioRepository.listarHistorial(infoEnvioId, { conUsuario }, client);

  return filas.map((fila) => ({
    estadoAnterior: fila.estadoAnterior,
    estadoNuevo: fila.estadoNuevo,
    creadoEn: fila.creadoEn,
    ...(conUsuario ? { usuario: { id: fila.usuario.id, nombre: fila.usuario.nombre } } : {}),
  }));
}

// Seguimiento completo (pedido + historial) visible para `usuario`. El pedido
// y el historial son DOS consultas, así que se leen dentro de una transacción
// de solo lectura: MySQL/MariaDB (InnoDB) trabaja en REPEATABLE READ por
// defecto y el snapshot se toma en la primera lectura, de modo que un cambio
// de envío confirmado entre las dos no se mezcla (estadoEnvio X con un
// historial que ya termina en Y). Sin locks: no bloquea a quien escribe.
// Lo comparten GET /seguimiento y la respuesta de PUT /estado-envio.
async function leerSeguimiento(pedidoId, usuario) {
  return prisma.$transaction(async (tx) => {
    const pedido = await obtenerVisible(pedidoId, usuario, tx);

    if (!pedido.infoEnvio) {
      throw new EnvioNoRegistradoError(404);
    }

    return presentarSeguimiento(pedido, await cargarHistorial(pedido.infoEnvio.id, usuario, tx));
  }, OPCIONES_TRANSACCION);
}

/**
 * PUT /api/v1/pedidos/:id/estado-envio (admin y vendedor, RF-029). Avanza el
 * envío un paso (validarTransicionEstado: sin saltos ni retrocesos) y
 * sincroniza Pedido.estado en la misma transacción, bajo el lock del pedido.
 * El cambio queda en el historial con `usuario`, quien lo hace (RF-029).
 * Solo si el pedido ya está en preparación o en camino; entrar en
 * preparación es PATCH /estado (CONFIRMADO -> EN_PREPARACION).
 */
async function actualizarEstadoEnvio(pedidoId, estadoEnvio, usuario) {
  await enTransaccion("ACTUALIZAR_ESTADO_ENVIO", async (tx) => {
    const bloqueado = await pedidoRepository.bloquearPedido(pedidoId, tx);

    if (!bloqueado) {
      throw new PedidoNoEncontradoError();
    }

    if (!ESTADOS_PEDIDO_EN_ENVIO.includes(bloqueado.estado)) {
      throw new TransicionEnvioInvalidaError(
        `El envío no se puede mover con el pedido en ${bloqueado.estado}: ` +
          "primero el pedido tiene que pasar a EN_PREPARACION"
      );
    }

    const info = await envioRepository.obtenerInfoEnvio(pedidoId, tx);
    if (!info) {
      throw new EnvioNoRegistradoError();
    }

    await envioService.cambiarEstadoEnvio(
      { pedidoId, info, estadoNuevo: estadoEnvio, usuarioId: Number(usuario.id) },
      tx
    );
    await pedidoRepository.actualizarEstado(pedidoId, estadoEnvio, tx);
  });

  return leerSeguimiento(pedidoId, usuario);
}

/**
 * GET /api/v1/pedidos/:id/seguimiento (RF-028): dueño, admin y vendedor; un
 * pedido ajeno responde 404 como uno inexistente. Estado actual de envío y
 * del pedido, fecha y hora del último cambio, dirección de entrega e
 * historial de cambios de envío (RF-028); admin y vendedor ven además quién
 * hizo cada cambio (RF-029).
 */
async function obtenerSeguimiento(pedidoId, usuario) {
  return leerSeguimiento(pedidoId, usuario);
}

module.exports = {
  crearPedido,
  actualizarEstadoEnvio,
  obtenerSeguimiento,
  listarPedidos,
  obtenerPedidoPorId,
  actualizarEstado,
  validarTransicionPedido,
  TRANSICIONES_PEDIDO,
  cancelarPedido,
  cancelarPedidosVencidos,
  esCancelable,
  mensajeNoCancelable,
  ESTADOS_CANCELABLES,
  ESTADOS_CANCELABLES_CONTRA_ENTREGA,
  MARGEN_VENCIMIENTO_MS,
  esErrorReintentable,
  presentarPedido,
  aCentavos,
  deCentavos,
  CarritoVacioError,
  ProductoNoDisponibleError,
  PedidoNoCancelableError,
  TransicionEstadoInvalidaError,
  EnvioNoRegistradoError,
  MontoFueraDeRangoError,
  MontoNoEnteroCopError,
  // Reexportadas para que el controller y los tests no dependan de dónde
  // nació cada error.
  StockInsuficienteError,
  CoberturaNoDisponibleError,
  DireccionNoAutorizadaError,
  ContraEntregaNoDisponibleError,
  PedidoNoEncontradoError,
};
