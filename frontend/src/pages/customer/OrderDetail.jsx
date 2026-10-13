
import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import {
  obtenerPorId,
  obtenerSeguimiento,
} from "../../services/pedido.service";
import "./OrderDetail.css";



function formatoFecha(fecha) {
  if (!fecha) return "No disponible";

  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return fecha;

  return valor.toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatoPrecio(valor) {
  return Number(valor ?? 0).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function obtenerDatos(respuesta) {
  return respuesta?.datos ?? respuesta?.data ?? respuesta;
}

function obtenerLineas(pedido) {
  return pedido?.detalles ?? pedido?.items ?? pedido?.lineas ?? [];
}

export default function OrderDetail() {
  const { id } = useParams();

  const [pedido, setPedido] = useState(null);
  const [seguimiento, setSeguimiento] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  
const location = useLocation();
const mensajeRetorno = location.state?.mensaje;


  useEffect(() => {
    let activo = true;

    async function cargarPedido() {
      setCargando(true);
      setError("");

      try {
        const respuestaPedido = await obtenerPorId(id);
        const pedidoEncontrado = obtenerDatos(respuestaPedido);

        if (!activo) return;
        setPedido(pedidoEncontrado);

        try {
          const respuestaSeguimiento = await obtenerSeguimiento(id);
          if (activo) {
            setSeguimiento(obtenerDatos(respuestaSeguimiento));
          }
        } catch {
          // Si el seguimiento no está disponible, se muestra el estado actual del pedido.
          if (activo) setSeguimiento(null);
        }
      } catch (err) {
        if (!activo) return;

        const estadoHttp = err?.response?.status;

        if (estadoHttp === 403 || estadoHttp === 404) {
          setError(
            "No se encontró este pedido o no tienes permiso para consultarlo."
          );
        } else {
          setError(
            "No fue posible cargar el pedido. Comprueba tu conexión e inténtalo de nuevo."
          );
        }
      } finally {
        if (activo) setCargando(false);
      }
    }

    cargarPedido();

    return () => {
      activo = false;
    };
  }, [id]);

  if (cargando) {
    return (
      <main className="order-detail">
        <p className="order-detail__message">Cargando pedido...</p>
      </main>
    );
  }

  if (error || !pedido) {
    return (
      <main className="order-detail">
        <section className="order-detail__message order-detail__error">
          <h2>No se puede mostrar el pedido</h2>
          <p>{error || "La información del pedido no está disponible."}</p>
          <Link to="/pedidos" className="order-detail__back">
            Volver a mis pedidos
          </Link>
        </section>
      </main>
    );
  }

  const lineas = obtenerLineas(pedido);
  const envio =
    pedido.infoEnvio ?? pedido.envio ?? pedido.informacionEnvio ?? null;

  const historial =
    seguimiento?.historial ??
    seguimiento?.estados ??
    seguimiento?.seguimientos ??
    (Array.isArray(seguimiento) ? seguimiento : []);

  const estadoEnvio =
    envio?.estadoEnvio ??
    envio?.estado ??
    seguimiento?.estadoEnvio ??
    seguimiento?.estado ??
    "Sin información";

  const fechaActualizacionEnvio =
    envio?.actualizadoEn ??
    envio?.fechaActualizacion ??
    seguimiento?.actualizadoEn ??
    seguimiento?.fechaActualizacion ??
    null;

  return (
    <main className="order-detail">
      <header className="order-detail__header">
        <div>
          <Link to="/pedidos" className="order-detail__back">
            ← Volver a mis pedidos
          </Link>
          
{mensajeRetorno && (
  <p role="status" className="order-detail__notice">
    {mensajeRetorno}
  </p>
)}

          <h1>Detalle del pedido</h1>
          <p>
            Pedido{" "}
            <strong>
              {pedido.numero ?? `#${pedido.id}`}
            </strong>
          </p>
        </div>

        <span className="order-detail__badge">
          {pedido.estado ?? "Estado no disponible"}
        </span>
      </header>

      <section className="order-detail__card">
        <h2>Información del pedido</h2>
        <p>
          <strong>Fecha:</strong>{" "}
          {formatoFecha(pedido.creadoEn ?? pedido.fecha ?? pedido.createdAt)}
        </p>
        <p>
          <strong>Estado del pedido:</strong>{" "}
          {pedido.estado ?? "No disponible"}
        </p>
      </section>

      <section className="order-detail__card">
        <h2>Productos</h2>

        {lineas.length === 0 ? (
          <p>No hay productos registrados en este pedido.</p>
        ) : (
          <div className="order-detail__table-wrapper">
            <table className="order-detail__table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Variante</th>
                  <th>Cantidad</th>
                  <th>Precio unitario</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((linea, indice) => {
                  const variante = linea.variante ?? {};
                  const producto =
                    variante.producto ?? linea.producto ?? {};

                  const cantidad = Number(linea.cantidad ?? 0);
                  const precio = Number(
                    linea.precioUnitario ??
                      linea.precio ??
                      linea.precioCongelado ??
                      0
                  );

                  const nombreVariante =
                    variante.nombre ??
                    [
                      variante.talla && `Talla ${variante.talla}`,
                      variante.color && `Color ${variante.color}`,
                    ]
                      .filter(Boolean)
                      .join(" / ") ??
                    "No especificada";

                  return (
                    <tr key={linea.id ?? `${producto.nombre}-${indice}`}>
                      <td>{producto.nombre ?? linea.nombreProducto ?? "Producto"}</td>
                      <td>{nombreVariante || "No especificada"}</td>
                      <td>{cantidad}</td>
                      <td>{formatoPrecio(precio)}</td>
                      <td>{formatoPrecio(precio * cantidad)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="order-detail__card">
        <h2>Resumen de pago</h2>
        <div className="order-detail__totals">
          <p>
            <span>Subtotal</span>
            <strong>{formatoPrecio(pedido.subtotal)}</strong>
          </p>
          <p>
            <span>Costo de envío</span>
            <strong>{formatoPrecio(pedido.costoEnvio)}</strong>
          </p>
          <p className="order-detail__total">
            <span>Total</span>
            <strong>{formatoPrecio(pedido.total)}</strong>
          </p>
        </div>
      </section>

      <section className="order-detail__card">
        <h2>Seguimiento del envío</h2>
        <p>
          <strong>Estado actual:</strong> {estadoEnvio}
        </p>
        <p>
          <strong>Última actualización:</strong>{" "}
          {formatoFecha(fechaActualizacionEnvio)}
        </p>

        {historial.length > 0 && (
          <>
            <h3>Historial de estados</h3>
            <ol className="order-detail__timeline">
              {historial.map((evento, indice) => (
                <li key={evento.id ?? `${evento.estado}-${indice}`}>
                  <strong>
                    {evento.estadoEnvio ??
                      evento.estado ??
                      evento.nombreEstado ??
                      "Actualización"}
                  </strong>
                  <span>
                    {formatoFecha(
                      evento.actualizadoEn ??
                        evento.fecha ??
                        evento.creadoEn
                    )}
                  </span>
                  {evento.descripcion && <p>{evento.descripcion}</p>}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </main>
  );
}
