
import useGestionPedidos from "../../hooks/useGestionPedidos";

const ESTADOS_PEDIDO = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "PAGO_APROBADO", label: "Pago aprobado" },
  { value: "CONFIRMADO", label: "Confirmado" },
  { value: "EN_PREPARACION", label: "En preparación" },
  { value: "ENVIADO", label: "Enviado" },
  { value: "EN_TRANSITO", label: "En tránsito" },
  { value: "ENTREGADO", label: "Entregado" },
  { value: "CANCELADO", label: "Cancelado" },
];

function fechaLegible(fecha) {
  if (!fecha) return "No disponible";

  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return "No disponible";

  return valor.toLocaleDateString("es-CO");
}

function precioLegible(precio) {
  return Number(precio ?? 0).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

export default function OrdersPanel() {
  const {
    pedidos,
    filtros,
    cambiarFiltro,
    limpiarFiltros,
    loading,
    error,
    recargar,
    cambiarEstadoPedido,
  } = useGestionPedidos();

  async function manejarCambioEstado(pedido, nuevoEstado) {
    if (nuevoEstado === pedido.estado) return;

    const actualizado = await cambiarEstadoPedido(pedido.id, nuevoEstado);

    if (!actualizado) {
      // El hook conserva y muestra el error.
      return;
    }
  }

  return (
    <section className="orders-panel">
      <header className="orders-panel__header">
        <div>
          <h1>Gestión de pedidos</h1>
          <p>Consulta los pedidos y administra sus estados.</p>
        </div>

        <button type="button" onClick={recargar} disabled={loading}>
          {loading ? "Cargando..." : "Actualizar"}
        </button>
      </header>

      <div className="orders-panel__filters">
        <label>
          Número de pedido
          <input
            type="search"
            placeholder="Buscar por número"
            value={filtros.numero}
            onChange={(e) => cambiarFiltro("numero", e.target.value)}
          />
        </label>

        <label>
          Estado
          <select
            value={filtros.estado}
            onChange={(e) => cambiarFiltro("estado", e.target.value)}
          >
            <option value="">Todos los estados</option>
            {ESTADOS_PEDIDO.map((estado) => (
              <option key={estado.value} value={estado.value}>
                {estado.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          ID del cliente
          <input
            type="number"
            min="1"
            placeholder="ID de usuario"
            value={filtros.usuarioId}
            onChange={(e) => cambiarFiltro("usuarioId", e.target.value)}
          />
        </label>

        <button type="button" onClick={limpiarFiltros}>
          Limpiar filtros
        </button>
      </div>

      {error && (
        <p className="orders-panel__error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="orders-panel__message">Cargando pedidos...</p>
      ) : pedidos.length === 0 ? (
        <p className="orders-panel__message">
          No se encontraron pedidos con los filtros seleccionados.
        </p>
      ) : (
        <div className="orders-panel__table-wrapper">
          <table className="orders-panel__table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Total</th>
                <th>Actualizar estado</th>
              </tr>
            </thead>

            <tbody>
              {pedidos.map((pedido) => {
                const cliente = pedido.usuario ?? pedido.cliente ?? {};

                const nombreCliente =
                  [
                    cliente.nombre,
                    cliente.apellido,
                  ]
                    .filter(Boolean)
                    .join(" ") ||
                  cliente.nombreCompleto ||
                  cliente.email ||
                  (pedido.usuarioId
                    ? `Usuario #${pedido.usuarioId}`
                    : "No disponible");

                return (
                  <tr key={pedido.id}>
                    <td>{pedido.numero ?? `#${pedido.id}`}</td>
                    <td>{nombreCliente}</td>
                    <td>
                      {fechaLegible(
                        pedido.creadoEn ?? pedido.fecha ?? pedido.createdAt
                      )}
                    </td>
                    <td>{pedido.estado ?? "Sin estado"}</td>
                    <td>{precioLegible(pedido.total)}</td>
                    <td>
                      <select
                        aria-label={`Cambiar estado del pedido ${pedido.numero ?? pedido.id}`}
                        value={pedido.estado ?? ""}
                        onChange={(e) =>
                          manejarCambioEstado(pedido, e.target.value)
                        }
                        disabled={!pedido.estado}
                      >
                        {ESTADOS_PEDIDO.map((estado) => (
                          <option key={estado.value} value={estado.value}>
                            {estado.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="orders-panel__count">
        Pedidos encontrados: {pedidos.length}
      </p>
    </section>
  );
}
