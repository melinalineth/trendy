import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import Alert from "../../components/common/Alert";
import Badge from "../../components/common/Badge";
import Button from "../../components/common/Button";
import Loading from "../../components/common/Loading";
import { usePedidoDetalle } from "../../hooks/usePedidos";
import {
  ESTADOS_ENVIO,
  PASOS_ENVIO,
  badgeEstadoPago,
  badgeEstadoPedido,
  describirVariante,
  descripcionEstadoPedido,
  etiquetaEstadoPago,
  etiquetaEstadoPedido,
  etiquetaMetodoPago,
  formatearFecha,
  formatearPrecio,
  mensajeErrorContraEntrega,
  mensajeErrorPreferencia,
  sePuedeReintentarPago,
} from "../../components/orders/pedidoEstados";
import "./OrderDetail.css";

// Mientras el pedido espera el pago de Mercado Pago se refresca solo cada
// INTERVALO_REFRESCO_MS, como máximo REFRESCOS_AUTOMATICOS veces (2 minutos):
// la preferencia no tiene back_urls, así que al volver de Mercado Pago la
// persona abre esta página a mano y el webhook puede tardar unos segundos.
const INTERVALO_REFRESCO_MS = 15000;
const REFRESCOS_AUTOMATICOS = 8;

// Seguimiento del envío (RF-028): los 4 pasos de InfoEnvio. No hay historial
// guardado todavía, así que solo el paso actual muestra su fecha.
function SeguimientoEnvio({ pedido, seguimiento }) {
  // Un contra entrega se puede cancelar aun después de salir de la tienda (por
  // ejemplo, si lo rechazás en la puerta), así que un pedido cancelado pudo
  // haber tenido envío: no se afirma lo contrario ni se muestran los pasos.
  if (pedido.estado === "CANCELADO") {
    return (
      <p className="order-detail__nota">
        Este pedido fue cancelado. Si ya lo habías recibido o estaba en camino,
        comunicate con la tienda.
      </p>
    );
  }

  // Antes de EN_PREPARACION el estadoEnvio vale el de alta y no significa
  // nada: manda el estado del pedido (docs/diseno/pedidos-estados.md §1).
  const enEnvio = ESTADOS_ENVIO.includes(pedido.estado);
  const estadoEnvio = enEnvio
    ? (seguimiento?.estadoEnvio ?? pedido.infoEnvio?.estadoEnvio ?? pedido.estado)
    : null;
  const indiceActual = PASOS_ENVIO.findIndex((paso) => paso.estado === estadoEnvio);
  const actualizadoEn =
    seguimiento?.actualizadoEn ?? pedido.infoEnvio?.actualizadoEn ?? null;

  return (
    <>
      <ol className="order-detail__pasos">
        {PASOS_ENVIO.map((paso, indice) => {
          let estadoPaso = "pendiente";
          if (indiceActual >= 0 && indice < indiceActual) estadoPaso = "hecho";
          if (indice === indiceActual) estadoPaso = "actual";

          return (
            <li
              key={paso.estado}
              className={`order-detail__paso order-detail__paso--${estadoPaso}`}
              aria-current={estadoPaso === "actual" ? "step" : undefined}
            >
              <span className="order-detail__paso-marca" aria-hidden="true">
                {estadoPaso === "hecho" ? "✓" : indice + 1}
              </span>
              <span className="order-detail__paso-texto">
                {paso.etiqueta}
                <span className="order-detail__sr-only">
                  {estadoPaso === "hecho" && " (completado)"}
                  {estadoPaso === "actual" && " (estado actual)"}
                  {estadoPaso === "pendiente" && " (pendiente)"}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {enEnvio ? (
        <p className="order-detail__nota">
          Última actualización del envío: {formatearFecha(actualizadoEn)}
        </p>
      ) : (
        <p className="order-detail__nota">
          El envío empieza cuando tu pedido esté confirmado y en preparación.
        </p>
      )}
    </>
  );
}

function DireccionEntrega({ direccion }) {
  if (!direccion) {
    return <p className="order-detail__nota">Dirección no disponible.</p>;
  }

  return (
    <address className="order-detail__direccion">
      <strong>{direccion.destinatario}</strong>
      <span>{direccion.calle}</span>
      <span>
        {[direccion.ciudad, direccion.departamento].filter(Boolean).join(", ")}
      </span>
      {direccion.referencia && <span>{direccion.referencia}</span>}
      {direccion.telefono && <span>Tel. {direccion.telefono}</span>}
    </address>
  );
}

// Ruta /pedidos/:id. El detalle se monta con `key={id}`: al pasar de
// /pedidos/1 a /pedidos/2 (Atrás/Adelante, enlaces) React desmonta el de 1 y
// monta uno nuevo, así no se arrastran el bloqueo de pago, los avisos ni el
// "vencido" del pedido anterior, y una respuesta tardía del id viejo no
// puede tocar el estado del nuevo (su componente ya no existe).
export default function OrderDetail() {
  const { id } = useParams();

  return <DetallePedidoCliente key={id} id={id} />;
}

// Detalle de un pedido del cliente (RF-031) con su pago (RF-038) y el
// seguimiento del envío (RF-028). También es la pantalla de "vuelta" del
// checkout y de Mercado Pago. El cliente NO puede cancelar (el backend lo
// reserva al personal: 403), así que no hay botón de cancelar.
function DetallePedidoCliente({ id }) {
  const location = useLocation();
  const navigate = useNavigate();

  const {
    pedido,
    seguimiento,
    loading,
    error,
    actualizando,
    recargar,
    procesando,
    iniciarPagoMercadoPago,
    registrarContraEntrega,
  } = usePedidoDetalle(id);

  // Aviso que deja el checkout ("¡Gracias por tu compra!", "no pudimos
  // iniciar el pago..."). Se copia una vez y se borra del historial para que
  // no reaparezca al recargar la página.
  const [aviso, setAviso] = useState(() => location.state?.aviso ?? null);
  const [avisoAccion, setAvisoAccion] = useState(null);
  const [vencido, setVencido] = useState(false);
  // El último intento de pago falló con un error que reintentar no arregla
  // (ver sePuedeReintentarPago): se oculta el botón para no ofrecer un clic
  // que va a devolver el mismo error.
  const [pagoSinSalida, setPagoSinSalida] = useState(false);

  useEffect(() => {
    if (location.state?.aviso) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const esperandoPagoMercadoPago =
    pedido?.estado === "PENDIENTE" &&
    pedido?.metodoPago === "MERCADO_PAGO" &&
    pedido?.pago?.estado !== "APROBADO" &&
    !vencido;

  // Refresco automático acotado mientras se espera la confirmación del pago.
  useEffect(() => {
    if (!esperandoPagoMercadoPago) return undefined;

    let restantes = REFRESCOS_AUTOMATICOS;
    const intervalo = window.setInterval(() => {
      restantes -= 1;
      recargar();
      if (restantes <= 0) window.clearInterval(intervalo);
    }, INTERVALO_REFRESCO_MS);

    return () => window.clearInterval(intervalo);
  }, [esperandoPagoMercadoPago, recargar]);

  async function pagar() {
    // Un solo aviso a la vez: el del checkout (o el de un intento anterior)
    // se reemplaza por el resultado de este intento.
    setAviso(null);
    setAvisoAccion(null);
    const resultado = await iniciarPagoMercadoPago();

    if (resultado.ignorado) return;

    // El hook solo devuelve ok con una URL de Mercado Pago validada
    // (esUrlDeCheckoutValida); si la navegación no ocurre, libera el botón
    // a los pocos segundos.
    if (resultado.ok) {
      window.location.assign(resultado.checkoutUrl);
      return;
    }

    if (resultado.error?.codigo === "PEDIDO_VENCIDO") setVencido(true);
    else if (!sePuedeReintentarPago(resultado.error)) setPagoSinSalida(true);
    setAvisoAccion({ tipo: "error", mensaje: mensajeErrorPreferencia(resultado.error) });
  }

  async function registrarPagoContraEntrega() {
    setAviso(null);
    setAvisoAccion(null);
    const resultado = await registrarContraEntrega();

    if (resultado.ignorado) return;

    setAvisoAccion(
      resultado.ok
        ? { tipo: "success", mensaje: "Listo: registramos tu pago contra entrega. Pagás al recibir el pedido." }
        : { tipo: "error", mensaje: mensajeErrorContraEntrega(resultado.error) },
    );
  }

  if (loading) {
    return (
      <main className="order-detail">
        <Loading text="Cargando pedido..." />
      </main>
    );
  }

  if (!pedido) {
    // 404 = no existe o es de otra persona (RN-003); 400 = id inválido.
    const noEncontrado = error?.status === 404 || error?.status === 400;

    return (
      <main className="order-detail">
        <section className="order-detail__card order-detail__mensaje" role="alert">
          <h1>No se puede mostrar el pedido</h1>
          <p>
            {noEncontrado
              ? "No encontramos este pedido o no tenés permiso para consultarlo."
              : (error?.mensaje ?? "La información del pedido no está disponible.")}
          </p>
          <div className="order-detail__acciones">
            {!noEncontrado && (
              <Button
                text={actualizando ? "Reintentando..." : "Reintentar"}
                onClick={recargar}
                disabled={actualizando}
              />
            )}
            <Link to="/pedidos" className="order-detail__link">
              Volver a mis pedidos
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const lineas = pedido.detalles ?? [];
  const esMercadoPago = pedido.metodoPago === "MERCADO_PAGO";
  const pago = pedido.pago ?? null;
  const puedePagar = esperandoPagoMercadoPago && !pagoSinSalida;
  const puedeRegistrarContraEntrega =
    pedido.estado === "PENDIENTE" && !esMercadoPago && !pago;
  const direccion = seguimiento?.direccion ?? pedido.direccion ?? null;

  let textoPago = "";
  if (pago?.estado === "APROBADO") {
    textoPago = "Tu pago está aprobado.";
  } else if (esMercadoPago && pedido.estado === "PENDIENTE") {
    textoPago =
      pago?.estado === "RECHAZADO"
        ? "Tu último intento de pago fue rechazado. Podés intentar de nuevo."
        : "Todavía no registramos tu pago. Si ya pagaste en Mercado Pago, la confirmación puede tardar unos minutos: tocá «Actualizar».";
  } else if (!esMercadoPago && pago?.estado === "PENDIENTE") {
    textoPago = `Pagás ${formatearPrecio(pedido.total)} al recibir tu pedido.`;
  } else if (puedeRegistrarContraEntrega) {
    textoPago =
      "Falta registrar tu pago contra entrega para que la tienda pueda confirmar el pedido.";
  }

  return (
    <main className="order-detail">
      <header className="order-detail__header">
        <div>
          <Link to="/pedidos" className="order-detail__link">
            ← Volver a mis pedidos
          </Link>
          <h1>Detalle del pedido</h1>
          <p>
            Pedido <strong>{pedido.numero ?? `#${pedido.id}`}</strong>
          </p>
        </div>

        <div className="order-detail__header-acciones">
          <Badge
            text={etiquetaEstadoPedido(pedido.estado)}
            type={badgeEstadoPedido(pedido.estado)}
          />
          <Button
            className="order-detail__btn--secundario"
            text={actualizando ? "Actualizando..." : "Actualizar"}
            onClick={recargar}
            disabled={actualizando}
          />
        </div>
      </header>

      <div className="order-detail__avisos" aria-live="polite">
        {aviso && (
          <Alert type={aviso.tipo} message={aviso.mensaje} onClose={() => setAviso(null)} />
        )}
        {avisoAccion && (
          <Alert
            type={avisoAccion.tipo}
            message={avisoAccion.mensaje}
            onClose={() => setAvisoAccion(null)}
          />
        )}
        {error && (
          <Alert
            type="warning"
            message="No pudimos actualizar el pedido: lo que ves puede no estar al día."
          />
        )}
      </div>

      <div className="order-detail__grid">
        <section className="order-detail__card" aria-labelledby="pedido-estado">
          <h2 id="pedido-estado">Estado del pedido</h2>
          <p>{descripcionEstadoPedido(pedido.estado, pedido.metodoPago)}</p>
          <dl className="order-detail__datos">
            <div>
              <dt>Fecha</dt>
              <dd>{formatearFecha(pedido.creadoEn)}</dd>
            </div>
            <div>
              <dt>Método de pago</dt>
              <dd>{etiquetaMetodoPago(pedido.metodoPago)}</dd>
            </div>
          </dl>
        </section>

        <section className="order-detail__card" aria-labelledby="pedido-pago">
          <h2 id="pedido-pago">Pago</h2>
          <div className="order-detail__fila-badge">
            <span>Estado del pago</span>
            {pago ? (
              <Badge text={etiquetaEstadoPago(pago.estado)} type={badgeEstadoPago(pago.estado)} />
            ) : (
              <span className="order-detail__nota">Sin pago registrado</span>
            )}
          </div>
          {textoPago && <p>{textoPago}</p>}

          {vencido && (
            <p className="order-detail__nota">
              El plazo para pagar este pedido venció.{" "}
              <Link to="/catalogo" className="order-detail__link">
                Hacer una compra nueva
              </Link>
            </p>
          )}

          {puedePagar && (
            <Button
              text={
                procesando
                  ? "Redirigiendo a Mercado Pago..."
                  : pago
                    ? "Reintentar pago"
                    : "Pagar con Mercado Pago"
              }
              onClick={pagar}
              disabled={procesando}
            />
          )}

          {puedeRegistrarContraEntrega && (
            <Button
              text={procesando ? "Registrando..." : "Registrar pago contra entrega"}
              onClick={registrarPagoContraEntrega}
              disabled={procesando}
            />
          )}
        </section>
      </div>

      <section className="order-detail__card" aria-labelledby="pedido-productos">
        <h2 id="pedido-productos">Productos</h2>

        {lineas.length === 0 ? (
          <p>No hay productos registrados en este pedido.</p>
        ) : (
          <div className="order-detail__table-wrapper">
            <table className="order-detail__table">
              <caption className="order-detail__sr-only">
                Productos del pedido con el precio pagado por unidad
              </caption>
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Variante</th>
                  <th scope="col">Cantidad</th>
                  <th scope="col">Precio unitario</th>
                  <th scope="col">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((linea) => {
                  const variante = linea.variante ?? null;
                  const cantidad = Number(linea.cantidad ?? 0);
                  // RN-008: precio HISTÓRICO congelado al crear el pedido.
                  const precio = Number(linea.precioUnitario ?? 0);
                  const subtotal = linea.subtotal ?? precio * cantidad;

                  return (
                    <tr key={linea.id}>
                      <td>{variante?.producto?.nombre ?? "Producto"}</td>
                      <td>{describirVariante(variante)}</td>
                      <td>{cantidad}</td>
                      <td>{formatearPrecio(precio)}</td>
                      <td>{formatearPrecio(subtotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <dl className="order-detail__totales">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatearPrecio(pedido.subtotal)}</dd>
          </div>
          <div>
            <dt>Costo de envío</dt>
            <dd>{formatearPrecio(pedido.costoEnvio)}</dd>
          </div>
          <div className="order-detail__total">
            <dt>Total</dt>
            <dd>{formatearPrecio(pedido.total)}</dd>
          </div>
        </dl>
      </section>

      <div className="order-detail__grid">
        <section className="order-detail__card" aria-labelledby="pedido-envio">
          <h2 id="pedido-envio">Seguimiento del envío</h2>
          <SeguimientoEnvio pedido={pedido} seguimiento={seguimiento} />
        </section>

        <section className="order-detail__card" aria-labelledby="pedido-direccion">
          <h2 id="pedido-direccion">Dirección de entrega</h2>
          <DireccionEntrega direccion={direccion} />
        </section>
      </div>
    </main>
  );
}
