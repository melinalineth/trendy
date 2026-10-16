import { Link } from "react-router-dom";

import Alert from "../../components/common/Alert";
import Badge from "../../components/common/Badge";
import Button from "../../components/common/Button";
import Loading from "../../components/common/Loading";
import Pagination from "../../components/common/Pagination";
import { usePedidos } from "../../hooks/usePedidos";
import {
  badgeEstadoPedido,
  etiquetaEstadoPedido,
  etiquetaMetodoPago,
  formatearFecha,
  formatearPrecio,
} from "../../components/orders/pedidoEstados";
import "./Orders.css";

// Mis pedidos (RF-031): pedidos del cliente autenticado, más recientes
// primero y paginados. El backend devuelve SOLO los propios (RN-003).
export default function Orders() {
  const {
    pedidos,
    paginacion,
    pagina,
    cambiarPagina,
    loading,
    error,
    recargar,
  } = usePedidos();

  const totalPaginas = paginacion?.totalPaginas ?? 0;

  return (
    <main className="orders">
      <header className="orders__header">
        <div>
          <h1>Mis pedidos</h1>
          <p>Consultá tus compras y revisá su estado.</p>
        </div>

        <Button
          className="orders__refresh"
          text={loading ? "Actualizando..." : "Actualizar"}
          onClick={recargar}
          disabled={loading}
        />
      </header>

      <div aria-live="polite">
        {error && !loading && (
          <div className="orders__error" role="alert">
            <Alert type="error" message={error} />
            <Button text="Intentar de nuevo" onClick={recargar} />
          </div>
        )}
      </div>

      {loading ? (
        <Loading text="Cargando tus pedidos..." />
      ) : !error && pedidos.length === 0 ? (
        <section className="orders__empty">
          <h2>Aún no tenés pedidos</h2>
          <p>Cuando realices una compra, aparecerá acá.</p>
          <Link to="/catalogo" className="orders__shop-link">
            Explorar productos
          </Link>
        </section>
      ) : (
        <section className="orders__list" aria-label="Lista de pedidos">
          {pedidos.map((pedido) => (
            <article className="orders__card" key={pedido.id}>
              <div className="orders__card-top">
                <div>
                  <span className="orders__label">Número de pedido</span>
                  <h2>{pedido.numero || `#${pedido.id}`}</h2>
                </div>

                <Badge
                  text={etiquetaEstadoPedido(pedido.estado)}
                  type={badgeEstadoPedido(pedido.estado)}
                />
              </div>

              <div className="orders__details">
                <div>
                  <span className="orders__label">Fecha</span>
                  <p>{formatearFecha(pedido.creadoEn, { conHora: false })}</p>
                </div>

                <div>
                  <span className="orders__label">Pago</span>
                  <p>{etiquetaMetodoPago(pedido.metodoPago)}</p>
                </div>

                <div>
                  <span className="orders__label">Total</span>
                  <p className="orders__total">{formatearPrecio(pedido.total)}</p>
                </div>
              </div>

              <Link to={`/pedidos/${pedido.id}`} className="orders__details-link">
                Ver detalle y seguimiento
                <span className="orders__sr-only"> del pedido {pedido.numero}</span>
                <span aria-hidden="true"> →</span>
              </Link>
            </article>
          ))}
        </section>
      )}

      {!loading && totalPaginas > 1 && (
        <nav className="orders__paginacion" aria-label="Páginas de pedidos">
          <Pagination
            currentPage={pagina}
            totalPages={totalPaginas}
            onPageChange={cambiarPagina}
          />
        </nav>
      )}
    </main>
  );
}
