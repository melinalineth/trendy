// backend/src/services/pedido.service.js
//
// Sprint 4 / MOD-06 (DDS §3): pedidos. Creación a partir del carrito
// (RF-030) con el alta de InfoEnvio (RF-027).
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
const inventarioService = require("./inventario.service");
const {
  PedidoNoEncontradoError,
  ContraEntregaNoDisponibleError,
  horasDeVigenciaPreferencia,
} = require("./pago.service");

const { CoberturaNoDisponibleError, DireccionNoAutorizadaError } = envioService;
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
  constructor(message = "El pedido no se puede cancelar en su estado actual") {
    super(message);
    this.name = "PedidoNoCancelableError";
    this.status = 409;
    this.codigo = "PEDIDO_NO_CANCELABLE";
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
//   - P2034 (deadlock / conflicto de escritura): MySQL ya revirtió TODO lo de
//     la víctima, así que repetirla es seguro; la idempotencia sale de los
//     locks y del estado leído bajo ellos. Es lo que recomienda Prisma. Pasa
//     con cualquier carga concurrente (en los tests, con la limpieza de otro
//     archivo que borra usuarios en paralelo).
//   - P2002 solo al crear: Pedido.numero es @unique y generarNumero puede
//     repetirse (mismo ms y mismo aleatorio); es el único unique que puede
//     chocar en esa transacción.
// Cada reintento deja una línea JSON (TRANSACCION_REINTENTADA): si aparecen
// seguido, hay un problema de orden de locks que mirar.
const INTENTOS_TRANSACCION = 3;

async function enTransaccion(operacion, fn, { reintentarUnique = false } = {}) {
  for (let intento = 1; ; intento++) {
    try {
      return await prisma.$transaction(fn, OPCIONES_TRANSACCION);
    } catch (error) {
      const reintentable =
        error?.code === "P2034" || (reintentarUnique && error?.code === "P2002");

      if (!reintentable || intento >= INTENTOS_TRANSACCION) {
        throw error;
      }

      logEvento({ evento: "TRANSACCION_REINTENTADA", operacion, intento, codigo: error.code });
      // Espera corta y aleatoria para que los dos lados no choquen de nuevo.
      await new Promise((resolver) => setTimeout(resolver, 10 * intento + Math.random() * 20));
    }
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
  await envioService.crearInfoEnvio(
    { pedidoId: pedido.id, direccionId, costoEnvio: deCentavos(costoEnvioCentavos) },
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

// Estados desde los que se puede cancelar (el stock sigue reservado y no hubo
// pago aprobado). PAGO_PENDIENTE / PAGO_RECHAZADO son legados del enum: el
// flujo vigente no los produce, pero si existieran se cancelan igual.
const ESTADOS_CANCELABLES = Object.freeze(["PENDIENTE", "PAGO_PENDIENTE", "PAGO_RECHAZADO"]);

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
// el mismo pedido se serializan en la misma fila.
//   - usuario: quien cancela; un cliente solo puede cancelar los suyos (uno
//     ajeno responde 404 como uno inexistente, RN-003). null = proceso interno.
//   - vencimiento: { corte } para la cancelación de vencidos. Si al tomar el
//     lock el pedido ya no cumple las condiciones (lo pagaron, lo cancelaron,
//     cambió de estado) se OMITE en vez de fallar.
// Devuelve { yaCancelado } o { omitido: true }.
async function cancelarBajoLock(tx, pedidoId, { usuario = null, motivo, vencimiento = null }) {
  const bloqueado = await pedidoRepository.bloquearPedido(pedidoId, tx);

  if (!bloqueado) {
    if (vencimiento) return { omitido: true };
    throw new PedidoNoEncontradoError();
  }

  if (usuario && !esPersonal(usuario) && Number(bloqueado.usuarioId) !== Number(usuario.id)) {
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
      "El pedido tiene un pago aprobado: no se puede cancelar desde el sistema (el reembolso se gestiona manualmente)"
    );
  }

  if (!ESTADOS_CANCELABLES.includes(bloqueado.estado)) {
    throw new PedidoNoCancelableError(
      `No se puede cancelar un pedido en estado ${bloqueado.estado}; solo se cancelan pedidos pendientes de pago`
    );
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

  return { yaCancelado: false };
}

/**
 * PATCH /api/v1/pedidos/:id/cancelar: el cliente cancela su pedido; admin y
 * vendedor, cualquiera. Solo pedidos pendientes de pago y sin Pago APROBADO.
 * Repetirlo responde 200 { yaCancelado: true } sin reponer otra vez.
 */
async function cancelarPedido(pedidoId, usuario) {
  const { yaCancelado } = await enTransaccion("CANCELAR_PEDIDO", (tx) =>
    cancelarBajoLock(tx, pedidoId, { usuario, motivo: MOTIVO_CANCELACION })
  );

  return {
    yaCancelado,
    pedido: presentarPedido(await pedidoRepository.obtenerPorId(pedidoId)),
  };
}

/**
 * Cancela (con reposición) los pedidos MERCADO_PAGO en PENDIENTE creados hace
 * más de `horas` horas y sin Pago APROBADO. Los CONTRA_ENTREGA no vencen (se
 * pagan al recibir). Cada pedido va en su propia transacción y bajo su lock,
 * donde se vuelve a validar todo. `horas` por defecto: la vigencia de la
 * preferencia de pago (MERCADOPAGO_PREFERENCIA_HORAS, mismo parseo que
 * pago.service; 24 si falta o es inválida). No hay cron: lo invoca un
 * scheduler externo vía POST /api/v1/pedidos/vencidos/cancelar.
 */
async function cancelarPedidosVencidos({ horas } = {}) {
  const horasEfectivas = horas ?? horasDeVigenciaPreferencia();
  const corte = new Date(Date.now() - horasEfectivas * HORA_MS);
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

module.exports = {
  crearPedido,
  cancelarPedido,
  cancelarPedidosVencidos,
  presentarPedido,
  aCentavos,
  deCentavos,
  CarritoVacioError,
  ProductoNoDisponibleError,
  PedidoNoCancelableError,
  MontoFueraDeRangoError,
  // Reexportadas para que el controller y los tests no dependan de dónde
  // nació cada error.
  StockInsuficienteError,
  CoberturaNoDisponibleError,
  DireccionNoAutorizadaError,
  ContraEntregaNoDisponibleError,
  PedidoNoEncontradoError,
};
