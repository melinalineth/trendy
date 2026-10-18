const ventaRepository = require("../repositories/venta.repository");

// Sprint 5 / MOD-09 (RF-042).
//
// NOTA DE INTEGRACIÓN: este archivo agrupa la CONSULTA de ventas. El registro
// y la anulación (RF-041) viven en una sección propia aparte; no mezclar.

// ---------------------------------------------------------------------------
// --- Consulta (RF-042) ---
// ---------------------------------------------------------------------------

// Montos: SIEMPRE por centavos enteros, nunca multiplicando floats. Se parsea
// el TEXTO del Decimal (toFixed(2)) y se divide al final: "0.10" x 3 = 30
// centavos exactos. (Copia local y privada de pedido.service.aCentavos: no se
// importa pedido.service para no crear un ciclo de módulos con el registro de
// ventas, que pedido.service sí usa.)
function centavosDeDecimal(valor) {
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

// Centavos enteros -> pesos como número JSON (exacto con dos decimales).
const pesos = (centavos) => centavos / 100;

const pesosDeDecimal = (valor) => pesos(centavosDeDecimal(valor));

// Una línea del pedido. Precio y subtotal son los HISTÓRICOS de DetallePedido
// (RN-008). El texto (producto, sku, talla, color) sale de la variante y el
// producto actuales: DetallePedido no guarda una copia de esos textos.
function presentarProducto(detalle) {
  const { variante } = detalle;

  return {
    id: detalle.id,
    producto: variante.producto.nombre,
    sku: variante.sku,
    talla: variante.talla,
    color: variante.color,
    cantidad: detalle.cantidad,
    precioUnitario: pesosDeDecimal(detalle.precioUnitario),
    subtotal: pesos(centavosDeDecimal(detalle.precioUnitario) * detalle.cantidad),
  };
}

function presentarVenta(venta) {
  return {
    id: venta.id,
    pedidoId: venta.pedidoId,
    numeroPedido: venta.pedido.numero,
    estadoPedido: venta.pedido.estado,
    fecha: venta.registradaEn.toISOString(),
    cliente: { id: venta.cliente.id, nombre: venta.cliente.nombre },
    metodoPago: venta.metodoPago,
    estado: venta.estado,
    anuladaEn: venta.anuladaEn ? venta.anuladaEn.toISOString() : null,
    responsable: venta.responsable
      ? { id: venta.responsable.id, nombre: venta.responsable.nombre }
      : null,
    // Montos copiados al registrar la venta (no se recalculan del pedido).
    subtotal: pesosDeDecimal(venta.subtotal),
    costoEnvio: pesosDeDecimal(venta.costoEnvio),
    total: pesosDeDecimal(venta.total),
    productos: venta.pedido.detalles.map(presentarProducto),
  };
}

const presentarTotal = ({ cantidad, total }) => ({
  cantidad,
  total: pesosDeDecimal(total),
});

/**
 * Consulta de ventas (RF-042) para admin y vendedor: en v1.0 AMBOS ven TODAS las
 * ventas y los totales (las "ventas asignadas" a un vendedor quedan para una
 * versión posterior). El rol lo restringe la ruta (roleGuard), no este service.
 *
 * `filtros` son los ya validados por validarFiltrosVentas: { desde?,
 * hastaExclusivo?, estado?, pagina, limite }.
 *
 * `totales` cubre TODAS las ventas del rango desde/hasta (no solo la página) e
 * IGNORA `estado`: las tarjetas «Registradas» y «Anuladas» siempre muestran el
 * consolidado del período.
 */
async function consultar(filtros) {
  const { desde, hastaExclusivo, estado, pagina, limite } = filtros;
  const rango = { desde, hastaExclusivo };

  const [filas, total, totales] = await Promise.all([
    ventaRepository.listar({ ...rango, estado, skip: (pagina - 1) * limite, take: limite }),
    ventaRepository.contar({ ...rango, estado }),
    ventaRepository.totalesPorEstado(rango),
  ]);

  return {
    ventas: filas.map(presentarVenta),
    paginacion: {
      pagina,
      limite,
      total,
      totalPaginas: Math.max(1, Math.ceil(total / limite)),
    },
    totales: {
      registradas: presentarTotal(totales.REGISTRADA),
      anuladas: presentarTotal(totales.ANULADA),
    },
  };
}

// --- Fin Consulta (RF-042) ---

module.exports = {
  consultar,
};
