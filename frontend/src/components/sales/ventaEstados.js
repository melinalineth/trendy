// Estados de la venta tal como los define el backend (RF-041/RF-042), con su
// etiqueta y su variante de <Badge>. Los formatos de moneda, fecha y método de
// pago son los de pedidoEstados (formatearPrecio, formatearFecha,
// etiquetaMetodoPago): no se duplican acá.

const ESTADOS_VENTA_INFO = Object.freeze({
  REGISTRADA: { etiqueta: "Registrada", badge: "success" },
  ANULADA: { etiqueta: "Anulada", badge: "sale" },
});

// Estados que se pueden usar como filtro (el orden es el de las opciones).
export const ESTADOS_VENTA = Object.freeze(Object.keys(ESTADOS_VENTA_INFO));

export function etiquetaEstadoVenta(estado) {
  return ESTADOS_VENTA_INFO[estado]?.etiqueta ?? estado ?? "Sin estado";
}

export function badgeEstadoVenta(estado) {
  return ESTADOS_VENTA_INFO[estado]?.badge ?? "default";
}

// "1 venta" / "3 ventas".
export function textoVentas(cantidad) {
  return `${cantidad} ${cantidad === 1 ? "venta" : "ventas"}`;
}
