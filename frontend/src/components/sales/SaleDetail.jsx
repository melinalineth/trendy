import Badge from "../common/Badge";
import Table from "../common/Table";
import {
  badgeEstadoPedido,
  describirVariante,
  etiquetaEstadoPedido,
  etiquetaMetodoPago,
  formatearFecha,
  formatearPrecio,
} from "../orders/pedidoEstados";
import { badgeEstadoVenta, etiquetaEstadoVenta } from "./ventaEstados";
import "./SaleDetail.css";

// Quién registró la venta. El webhook de Mercado Pago la registra sin una
// persona, por eso `responsable` llega null en esos casos.
function textoResponsable(venta) {
  if (venta.responsable?.nombre) return venta.responsable.nombre;

  return venta.metodoPago === "MERCADO_PAGO"
    ? "Registrada automáticamente por el pago"
    : "No disponible";
}

const COLUMNAS_PRODUCTOS = [
  {
    key: "producto",
    label: "Producto",
    render: (linea) => (
      <>
        {linea.producto ?? "Producto"}
        <span className="sale-detail__muted">
          SKU {linea.sku ?? "—"} · {describirVariante(linea)}
        </span>
      </>
    ),
  },
  { key: "cantidad", label: "Cant." },
  {
    key: "precioUnitario",
    label: "Precio unitario",
    render: (linea) => formatearPrecio(linea.precioUnitario),
  },
  {
    key: "subtotal",
    label: "Subtotal",
    render: (linea) => formatearPrecio(linea.subtotal),
  },
];

// Detalle de una venta (RF-042) para el Modal del panel. Recibe la venta tal
// como la devuelve GET /ventas (ya trae sus líneas en `productos`, con el
// precio HISTÓRICO de la venta, no el actual del producto).
export default function SaleDetail({ venta }) {
  const anulada = venta.estado === "ANULADA";

  return (
    <div className="sale-detail">
      <dl className="sale-detail__datos">
        <div>
          <dt>Pedido</dt>
          <dd>
            {venta.numeroPedido ?? `#${venta.pedidoId}`}{" "}
            <Badge
              text={etiquetaEstadoPedido(venta.estadoPedido)}
              type={badgeEstadoPedido(venta.estadoPedido)}
            />
          </dd>
        </div>
        <div>
          <dt>Estado de la venta</dt>
          <dd>
            <Badge
              text={etiquetaEstadoVenta(venta.estado)}
              type={badgeEstadoVenta(venta.estado)}
            />
          </dd>
        </div>
        <div>
          <dt>Fecha de la venta</dt>
          <dd>{formatearFecha(venta.fecha)}</dd>
        </div>
        {anulada && (
          <div>
            <dt>Fecha de anulación</dt>
            <dd>{formatearFecha(venta.anuladaEn)}</dd>
          </div>
        )}
        <div>
          <dt>Cliente</dt>
          <dd>{venta.cliente?.nombre || "No disponible"}</dd>
        </div>
        <div>
          <dt>Método de pago</dt>
          <dd>{etiquetaMetodoPago(venta.metodoPago)}</dd>
        </div>
        <div>
          <dt>Responsable</dt>
          <dd>{textoResponsable(venta)}</dd>
        </div>
      </dl>

      <Table
        columns={COLUMNAS_PRODUCTOS}
        rows={venta.productos ?? []}
        keyField="id"
        emptyMessage="La venta no tiene productos."
      />

      <dl className="sale-detail__totales">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatearPrecio(venta.subtotal)}</dd>
        </div>
        <div>
          <dt>Envío</dt>
          <dd>{formatearPrecio(venta.costoEnvio)}</dd>
        </div>
        <div className="sale-detail__total">
          <dt>Total</dt>
          <dd>{formatearPrecio(venta.total)}</dd>
        </div>
      </dl>
    </div>
  );
}
