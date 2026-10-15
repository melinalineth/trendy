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
const carritoRepository = require("../repositories/carrito.repository");
const direccionRepository = require("../repositories/direccion.repository");
const zonaCoberturaRepository = require("../repositories/zonaCobertura.repository");
const envioService = require("./envio.service");
const inventarioService = require("./inventario.service");
const { PedidoNoEncontradoError, ContraEntregaNoDisponibleError } = require("./pago.service");

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

// Pedido.numero es @unique y generarNumero puede repetirse (mismo ms y mismo
// aleatorio): ante P2002 se reintenta la transacción completa.
const INTENTOS_NUMERO = 3;

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

  let pedidoId;
  for (let intento = 1; ; intento++) {
    try {
      pedidoId = await prisma.$transaction(
        (tx) => crearEnTransaccion(tx, datos),
        OPCIONES_TRANSACCION
      );
      break;
    } catch (error) {
      // El único unique que puede chocar acá es Pedido.numero.
      if (error?.code === "P2002" && intento < INTENTOS_NUMERO) {
        continue;
      }
      throw error;
    }
  }

  return presentarPedido(await pedidoRepository.obtenerPorId(pedidoId));
}

module.exports = {
  crearPedido,
  presentarPedido,
  aCentavos,
  deCentavos,
  CarritoVacioError,
  ProductoNoDisponibleError,
  MontoFueraDeRangoError,
  // Reexportadas para que el controller y los tests no dependan de dónde
  // nació cada error.
  StockInsuficienteError,
  CoberturaNoDisponibleError,
  DireccionNoAutorizadaError,
  ContraEntregaNoDisponibleError,
  PedidoNoEncontradoError,
};
