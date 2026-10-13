
import { Link } from "react-router-dom";
import usePedidos from "../../hooks/usePedidos";
import "./Orders.css";

export default function Orders() {
  const { pedidos, loading, error, recargar } = usePedidos();

  function formatoCOP(valor) {
    return Number(valor || 0).toLocaleString("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    });
  }

  function formatoFecha(fecha) {
    if (!fecha) return "Fecha no disponible";

    const fechaValida = new Date(fecha);

    if (Number.isNaN(fechaValida.getTime())) {
      return "Fecha no disponible";
    }

    return fechaValida.toLocaleDateString("es-CO", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function textoEstado(estado) {
    return String(estado || "PENDIENTE")
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/^\w/, (letra) => letra.toUpperCase());
  }

  if (loading) {
    return (
      <main className="orders">
        <h1>Mis pedidos</h1>
        <p>Cargando tus pedidos...</p>
      </main>
    );
  }

  return (
    <main className="orders">
      <header className="orders__header">
        <div>
          <h1>Mis pedidos</h1>
          <p>Consulta tus compras y revisa su estado.</p>
        </div>

        <button
          type="button"
          className="orders__refresh"
          onClick={recargar}
        >
          Actualizar
        </button>
      </header>

      {error && (
        <div className="orders__error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={recargar}>
            Intentar de nuevo
          </button>
        </div>
      )}

      {!error && pedidos.length === 0 ? (
        <section className="orders__empty">
          <h2>Aún no tienes pedidos</h2>
          <p>Cuando realices una compra, aparecerá aquí.</p>
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

                <span
                  className={`orders__status orders__status--${String(
                    pedido.estado || "pendiente"
                  ).toLowerCase()}`}
                >
                  {textoEstado(pedido.estado)}
                </span>
              </div>

              <div className="orders__details">
                <div>
                  <span className="orders__label">Fecha</span>
                  <p>{formatoFecha(pedido.creadoEn || pedido.fecha)}</p>
                </div>

                <div>
                  <span className="orders__label">Total</span>
                  <p className="orders__total">
                    {formatoCOP(pedido.total)}
                  </p>
                </div>
              </div>

              <Link
                to={`/pedidos/${pedido.id}`}
                className="orders__details-link"
              >
                Ver detalle y seguimiento
                <span aria-hidden="true"> →</span>
              </Link>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
