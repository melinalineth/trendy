// Estados de pedido, envío y pago tal como los define el backend (ERS §4.2,
// docs/diseno/pedidos-estados.md), con su etiqueta y su variante de <Badge>.
// Lo comparten las pantallas del cliente (Mis pedidos, detalle, checkout) y
// el panel de gestión (OrdersPanel).

// ---------------------------------------------------------------------------
// Estado del pedido
// ---------------------------------------------------------------------------

// Etiqueta y tipo de Badge (default | new | sale | discount | success |
// warning | info, ver Badge.css). PAGO_APROBADO, PAGO_RECHAZADO y
// PAGO_PENDIENTE son legados del enum: el flujo vigente no los produce, pero
// si aparecen se muestran igual (etiqueta defensiva).
const ESTADOS_PEDIDO_INFO = Object.freeze({
  PENDIENTE: { etiqueta: "Pendiente de pago", badge: "warning" },
  PAGO_APROBADO: { etiqueta: "Pago aprobado", badge: "info" },
  CONFIRMADO: { etiqueta: "Confirmado", badge: "info" },
  EN_PREPARACION: { etiqueta: "En preparación", badge: "new" },
  ENVIADO: { etiqueta: "Enviado", badge: "success" },
  EN_TRANSITO: { etiqueta: "En tránsito", badge: "success" },
  ENTREGADO: { etiqueta: "Entregado", badge: "success" },
  CANCELADO: { etiqueta: "Cancelado", badge: "sale" },
  PAGO_RECHAZADO: { etiqueta: "Pago rechazado", badge: "sale" },
  PAGO_PENDIENTE: { etiqueta: "Pago pendiente", badge: "warning" },
});

// Estados que el personal puede usar como filtro del listado (los mismos del
// enum del backend, en el orden del ciclo de vida).
export const ESTADOS_PEDIDO = Object.freeze(Object.keys(ESTADOS_PEDIDO_INFO));

export function etiquetaEstadoPedido(estado) {
  return ESTADOS_PEDIDO_INFO[estado]?.etiqueta ?? estado ?? "Sin estado";
}

export function badgeEstadoPedido(estado) {
  return ESTADOS_PEDIDO_INFO[estado]?.badge ?? "default";
}

// Qué significa el estado para el cliente (detalle del pedido).
export function descripcionEstadoPedido(estado, metodoPago) {
  switch (estado) {
    case "PENDIENTE":
      return metodoPago === "CONTRA_ENTREGA"
        ? "Recibimos tu pedido. La tienda lo va a confirmar pronto y lo pagás al recibirlo."
        : "Estamos esperando tu pago para confirmar el pedido.";
    case "PAGO_APROBADO":
    case "CONFIRMADO":
      return "Tu pedido está confirmado. Pronto empezamos a prepararlo.";
    case "EN_PREPARACION":
      return "Estamos preparando tu pedido.";
    case "ENVIADO":
      return "Tu pedido ya salió de la tienda.";
    case "EN_TRANSITO":
      return "Tu pedido está en camino.";
    case "ENTREGADO":
      return "Tu pedido fue entregado. ¡Que lo disfrutes!";
    case "CANCELADO":
      return "Este pedido fue cancelado. Si ya habías pagado, comunicate con la tienda.";
    case "PAGO_RECHAZADO":
      return "El pago de este pedido fue rechazado.";
    case "PAGO_PENDIENTE":
      return "El pago de este pedido está en proceso.";
    default:
      return "";
  }
}

// Copia de TRANSICIONES_PEDIDO de backend/src/services/pedido.service.js
// (tabla de docs/diseno/pedidos-estados.md §3): transiciones MANUALES de
// PATCH /pedidos/:id/estado, lineales y hacia adelante. Si el backend cambia
// la tabla, hay que cambiar esta copia: la UI solo ofrece lo que está acá y el
// backend sigue siendo quien valida (409 TRANSICION_ESTADO_INVALIDA).
//   - PENDIENTE -> CONFIRMADO: solo contra entrega con su pago registrado (un
//     pedido de Mercado Pago lo confirma el webhook). Ver siguienteEstado.
//   - CANCELADO NO se fija por /estado (es PATCH /cancelar, repone stock) ni
//     tampoco los estados de pago: la UI nunca los ofrece.
export const TRANSICIONES_PEDIDO = Object.freeze({
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

// Estados desde los que el backend permite cancelar (ESTADOS_CANCELABLES de
// pedido.service.js), siempre que el pago no esté APROBADO.
export const ESTADOS_CANCELABLES = Object.freeze([
  "PENDIENTE",
  "PAGO_PENDIENTE",
  "PAGO_RECHAZADO",
]);

export function sePuedeCancelar(pedido) {
  return (
    ESTADOS_CANCELABLES.includes(pedido?.estado) &&
    pedido?.pago?.estado !== "APROBADO"
  );
}

// ---------------------------------------------------------------------------
// Envío (InfoEnvio.estadoEnvio, RF-028 / RF-029)
// ---------------------------------------------------------------------------

// Pasos del envío en orden (ESTADOS_ENVIO de envio.service.js). Mientras el
// pedido está en uno de estos estados, Pedido.estado e InfoEnvio.estadoEnvio
// valen lo mismo; antes (PENDIENTE, CONFIRMADO) o si se canceló, estadoEnvio
// queda en EN_PREPARACION y NO significa que se esté preparando: manda el
// estado del pedido (pedidos-estados.md §1).
export const PASOS_ENVIO = Object.freeze([
  { estado: "EN_PREPARACION", etiqueta: "En preparación" },
  { estado: "ENVIADO", etiqueta: "Enviado" },
  { estado: "EN_TRANSITO", etiqueta: "En tránsito" },
  { estado: "ENTREGADO", etiqueta: "Entregado" },
]);

export const ESTADOS_ENVIO = Object.freeze(PASOS_ENVIO.map((paso) => paso.estado));

export function etiquetaEstadoEnvio(estado) {
  return PASOS_ENVIO.find((paso) => paso.estado === estado)?.etiqueta ?? estado;
}

// ---------------------------------------------------------------------------
// Pago
// ---------------------------------------------------------------------------

export function etiquetaMetodoPago(metodo) {
  if (metodo === "MERCADO_PAGO") return "Mercado Pago";
  if (metodo === "CONTRA_ENTREGA") return "Pago contra entrega";
  return metodo ?? "No disponible";
}

// EstadoPago del schema: PENDIENTE, APROBADO, RECHAZADO, CANCELADO.
const ESTADOS_PAGO_INFO = Object.freeze({
  PENDIENTE: { etiqueta: "Pendiente", badge: "warning" },
  APROBADO: { etiqueta: "Aprobado", badge: "success" },
  RECHAZADO: { etiqueta: "Rechazado", badge: "sale" },
  CANCELADO: { etiqueta: "Cancelado", badge: "sale" },
});

export function etiquetaEstadoPago(estado) {
  return ESTADOS_PAGO_INFO[estado]?.etiqueta ?? estado ?? "Sin pago registrado";
}

export function badgeEstadoPago(estado) {
  return ESTADOS_PAGO_INFO[estado]?.badge ?? "default";
}

// Mensaje para el cliente cuando falla POST /pagos/mercadopago/preferencia.
export function mensajeErrorPreferencia(error) {
  switch (error?.codigo) {
    case "PEDIDO_VENCIDO":
      return "El plazo para pagar este pedido venció. El pedido se va a cancelar y los productos vuelven a estar disponibles: podés hacer una compra nueva.";
    case "PEDIDO_NO_PENDIENTE":
      return "Este pedido ya no está pendiente de pago.";
    case "METODO_PAGO_NO_COINCIDE":
      return "Este pedido no se creó para pagar con Mercado Pago.";
    case "TOTAL_INCONSISTENTE":
      return "Hay una inconsistencia en el total del pedido. Comunicate con la tienda antes de pagar.";
    case "CONFIGURACION_PAGOS_INCOMPLETA":
      return "El pago online no está disponible por ahora. Probá de nuevo más tarde; en tus próximas compras también podés elegir pago contra entrega.";
    case "PASARELA_NO_DISPONIBLE":
      return "No pudimos comunicarnos con Mercado Pago. Intentá de nuevo en unos minutos.";
    default:
      return error?.mensaje ?? "No pudimos iniciar el pago. Intentá de nuevo.";
  }
}

// Mensaje para el cliente cuando falla POST /pagos/contra-entrega.
export function mensajeErrorContraEntrega(error) {
  switch (error?.codigo) {
    case "CONTRA_ENTREGA_NO_DISPONIBLE":
      return "El pago contra entrega no está disponible en la zona de tu dirección.";
    case "METODO_PAGO_NO_COINCIDE":
      return "Este pedido no se creó para pagar contra entrega.";
    case "PEDIDO_NO_PENDIENTE":
      return "Este pedido ya no está pendiente.";
    default:
      return (
        error?.mensaje ??
        "No pudimos registrar el pago contra entrega. Intentá de nuevo."
      );
  }
}

// ---------------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------------

// Precio en pesos colombianos: sin decimales si es entero ($ 89.900), con 2 si
// trae centavos ($ 12.000,50). Los montos ya llegan como Number del backend.
export function formatearPrecio(valor) {
  const numero = Number(valor ?? 0);
  const decimales = Number.isInteger(numero) ? 0 : 2;

  return numero.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

// Fechas en la zona de la tienda (America/Bogota), la misma con la que el
// backend interpreta los filtros desde/hasta.
export function formatearFecha(fecha, { conHora = true } = {}) {
  if (!fecha) return "No disponible";

  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return "No disponible";

  return valor.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "medium",
    ...(conHora ? { timeStyle: "short" } : {}),
  });
}

// "Talla M · Azul" a partir de la variante de una línea del pedido.
export function describirVariante(variante) {
  if (!variante) return "No especificada";

  const partes = [
    variante.talla && `Talla ${variante.talla}`,
    variante.color,
  ].filter(Boolean);

  return partes.length > 0 ? partes.join(" · ") : "No especificada";
}
