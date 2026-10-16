import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { crearPreferencia } from "../../services/pago.service";
import { pagarContraEntrega } from "../../services/pago.service";

import Alert from "../../components/common/Alert";
import Button from "../../components/common/Button";
import Loading from "../../components/common/Loading";
import Select from "../../components/common/Select";
import { useCarrito } from "../../hooks/useCarrito";
import { useDirecciones } from "../../hooks/useDirecciones";
import { ESPERA_REDIRECCION_MS, usePedidos } from "../../hooks/usePedidos";
import pagoService from "../../services/pago.service";
import { obtenerErrorApi } from "../../services/apiError";
import {
  describirVariante,
  esUrlDeCheckoutValida,
  formatearPrecio,
  mensajeErrorContraEntrega,
  mensajeErrorPreferencia,
  sePuedeReintentarContraEntrega,
  sePuedeReintentarPago,
  textoUnidades,
} from "../../components/orders/pedidoEstados";
import "./Checkout.css";

const METODOS_PAGO = [
  {
    valor: "MERCADO_PAGO",
    etiqueta: "Mercado Pago",
    descripcion:
      "Tarjeta, PSE y otros medios. Te llevamos al sitio seguro de Mercado Pago para pagar.",
  },
  {
    valor: "CONTRA_ENTREGA",
    etiqueta: "Pago contra entrega",
    descripcion:
      "Pagás al recibir tu pedido. Disponible solo en algunas zonas de cobertura.",
  },
];

function describirDireccion(direccion) {
  return `${direccion.destinatario} — ${direccion.calle}, ${direccion.ciudad}`;
}

// "Chaqueta denim (Talla M · Azul)" para la línea del carrito con esa
// variante, o un texto genérico si ya no está en el carrito.
function nombreDeVariante(items, varianteId) {
  const item = items.find(
    (linea) =>
      Number(linea.varianteId ?? linea.variante?.id) === Number(varianteId),
  );

  if (!item) return "uno de los productos";

  return `${item.variante.producto.nombre} (${describirVariante(item.variante)})`;
}

// Traduce el error de POST /pedidos a un mensaje para el cliente y, si
// corresponde, a dónde ir para resolverlo. El pedido NO se creó en ninguno de
// estos casos (el backend valida antes o revierte la transacción completa).
function describirErrorCreacion(error, items) {
  const carrito = { to: "/carrito", texto: "Ir al carrito" };

  switch (error?.codigo) {
    case "STOCK_INSUFICIENTE": {
      const nombre = nombreDeVariante(items, error.contexto?.varianteId);
      const disponible = Number(error.contexto?.disponible);
      const quedan =
        Number.isFinite(disponible) && disponible > 0
          ? `${disponible === 1 ? "Queda" : "Quedan"} ${textoUnidades(disponible)}.`
          : "Se agotó.";

      return {
        mensaje: `No hay stock suficiente de ${nombre}. ${quedan} Ajustá la cantidad en tu carrito para continuar.`,
        accion: carrito,
      };
    }
    case "PRODUCTO_NO_DISPONIBLE":
      return {
        mensaje: `${nombreDeVariante(items, error.contexto?.varianteId)} ya no está disponible para la venta. Eliminalo de tu carrito para continuar.`,
        accion: carrito,
      };
    case "CARRITO_VACIO":
      return {
        mensaje:
          "Tu carrito está vacío. Si acabás de confirmar una compra, la encontrás en Mis pedidos.",
        accion: { to: "/pedidos", texto: "Ver mis pedidos" },
      };
    case "SIN_COBERTURA":
      return {
        mensaje:
          "Todavía no hacemos envíos a la dirección elegida. Elegí otra dirección o agregá una nueva.",
        accion: { to: "/direcciones", texto: "Mis direcciones" },
      };
    case "CONTRA_ENTREGA_NO_DISPONIBLE":
      return {
        mensaje:
          "El pago contra entrega no está disponible en la zona de tu dirección. Elegí Mercado Pago o usá otra dirección.",
        accion: null,
      };
    case "DIRECCION_NO_ENCONTRADA":
      return {
        mensaje: "La dirección elegida ya no existe. Elegí otra dirección.",
        accion: null,
      };
    case "VALIDACION_FALLIDA":
      return {
        mensaje: "Revisá la dirección y el método de pago elegidos.",
        accion: null,
      };
    case "ACCESO_DENEGADO":
      return {
        mensaje: "Solo una cuenta de cliente puede realizar compras.",
        accion: null,
      };
    default:
      // Sin respuesta (red) o 5xx: el backend pudo haber creado el pedido
      // antes de fallar la respuesta. Antes de reintentar hay que mirar Mis
      // pedidos para no comprar dos veces.
      if (esErrorIncierto(error)) {
        return {
          mensaje:
            "No pudimos confirmar si tu pedido se registró: puede que sí. Revisá «Mis pedidos» antes de volver a intentar.",
          accion: { to: "/pedidos", texto: "Ver mis pedidos" },
        };
      }

      return { mensaje: error?.mensaje ?? "No pudimos registrar tu pedido.", accion: null };
  }
}

// Error de red (sin respuesta) o del servidor (5xx): no sabemos si la
// operación llegó a aplicarse.
function esErrorIncierto(error) {
  return !error || error.status === null || error.status >= 500;
}

// Checkout (RF-030, RF-034, RF-037): resumen del carrito, dirección de
// entrega, método de pago y confirmación.
// Flujo: POST /pedidos -> Mercado Pago: POST /pagos/mercadopago/preferencia y
// redirección al checkout hospedado | contra entrega: POST
// /pagos/contra-entrega y detalle del pedido. Si el pedido se creó pero el
// pago no se pudo iniciar, NO se crea otro: se lleva al detalle del pedido,
// donde se puede reintentar el pago.
export default function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    direcciones,
    loading: cargandoDirecciones,
    error: errorDirecciones,
    recargar: recargarDirecciones,
  } = useDirecciones();

  // Dirección elegida en el carrito (si viene) o la principal.
  const [direccionElegida, setDireccionElegida] = useState(
    () => Number(location.state?.direccionId) || null,
  );
  const elegidaExiste = direcciones.some((d) => d.id === direccionElegida);
  const direccionPorDefecto =
    direcciones.find((d) => d.esPrincipal) ?? direcciones[0] ?? null;
  const direccionId = elegidaExiste
    ? direccionElegida
    : (direccionPorDefecto?.id ?? null);

  const {
    carrito,
    items,
    resumen,
    loading: cargandoCarrito,
    error: errorCarrito,
    errorEnvio,
    recargar: recargarCarrito,
  } = useCarrito({ direccionId });

  const { crearPedido } = usePedidos({ autoCargar: false });
  
const procesarPago = async (pedidoId, metodoPago) => {
  if (metodoPago === "MERCADO_PAGO") {
    const respuesta = await crearPreferencia(pedidoId);

    const initPoint =
      respuesta?.initPoint ??
      respuesta?.init_point ??
      respuesta?.data?.initPoint ??
      respuesta?.data?.init_point;

    if (!initPoint) {
      throw new Error(
        "No se recibió la URL de pago de Mercado Pago."
      );
    }

    window.location.href = initPoint;
    return;
  }

  if (metodoPago === "CONTRA_ENTREGA") {
    await pagarContraEntrega(pedidoId);

    // Usa aquí el mecanismo de navegación que ya tiene Checkout.
    window.location.href = `/pedidos/${pedidoId}?mensaje=${encodeURIComponent(
      "Pagás al recibir tu pedido"
    )}`;
    return;
  }

  throw new Error("Selecciona un método de pago válido.");
};
const pedido = await crearPedido(datosPedido);

// Adapta esta extracción a la respuesta real del servicio.
const pedidoId = pedido?.id ?? pedido?.data?.id;

if (!pedidoId) {
  throw new Error("No se pudo obtener el ID del pedido creado.");
}

await procesarPago(pedidoId, metodoPago);

  if (metodoPago === "MERCADO_PAGO") {
    const respuesta = await crearPreferencia(pedidoId);

    const initPoint =
      respuesta?.initPoint ??
      respuesta?.init_point ??
      respuesta?.data?.initPoint ??
      respuesta?.data?.init_point;

    if (!initPoint) {
      throw new Error(
        "No se recibió la URL de pago de Mercado Pago."
      );
    }

    window.location.href = initPoint;
    return;
  }

  if (metodoPago === "CONTRA_ENTREGA") {
    await pagarContraEntrega(pedidoId);

    // Usa aquí el mecanismo de navegación que ya tiene Checkout.
    window.location.href = `/pedidos/${pedidoId}?mensaje=${encodeURIComponent(
      "Pagás al recibir tu pedido"
    )}`;
    return;
  }

  throw new Error("Selecciona un método de pago válido.");
};


  const [metodoPago, setMetodoPago] = useState("MERCADO_PAGO");
  const [procesando, setProcesando] = useState(false);
  const [errorCompra, setErrorCompra] = useState(null);

  // Bloqueo síncrono de todo el flujo (pedido + pago): un doble clic o un
  // Enter repetido no puede crear dos pedidos.
  const procesandoRef = useRef(false);
  // Pedido ya creado en esta visita (para no volver a mostrar el checkout si
  // la persona vuelve con "Atrás" desde Mercado Pago).
  const pedidoCreadoRef = useRef(null);
  // Temporizador de "la redirección a Mercado Pago no ocurrió".
  const temporizadorRef = useRef(null);

  // Vuelta desde Mercado Pago con "Atrás" (página restaurada desde la caché
  // del navegador): el pedido ya existe, así que llevamos a su detalle.
  useEffect(() => {
    function alVolver(event) {
      if (event.persisted && pedidoCreadoRef.current) {
        window.clearTimeout(temporizadorRef.current);
        navigate(`/pedidos/${pedidoCreadoRef.current}`, { replace: true });
      }
    }

    window.addEventListener("pageshow", alVolver);
    return () => window.removeEventListener("pageshow", alVolver);
  }, [navigate]);

  useEffect(() => () => window.clearTimeout(temporizadorRef.current), []);

  function irAlDetalle(pedido, aviso) {
    navigate(`/pedidos/${pedido.id}`, { replace: true, state: { aviso } });
  }

  async function iniciarPago(pedido) {
    const numero = pedido.numero ?? `#${pedido.id}`;

    if (metodoPago === "MERCADO_PAGO") {
      let error;

      try {
        const datos = await pagoService.crearPreferencia(pedido.id);

        // Una URL que no es de Mercado Pago (o no es https) se trata igual
        // que una URL ausente: no se redirige y se va al detalle.
        if (esUrlDeCheckoutValida(datos?.checkoutUrl)) {
          // Checkout hospedado de Mercado Pago. El bloqueo de creación queda
          // tomado para siempre (el pedido ya existe). Si a los
          // ESPERA_REDIRECCION_MS la página sigue acá, la navegación no
          // ocurrió: llevamos al detalle para reintentar el pago desde ahí.
          window.location.assign(datos.checkoutUrl);
          temporizadorRef.current = window.setTimeout(() => {
            irAlDetalle(pedido, {
              tipo: "warning",
              mensaje: `Tu pedido ${numero} quedó registrado y reservado, pero no pudimos abrir Mercado Pago. Podés reintentar el pago desde acá.`,
            });
          }, ESPERA_REDIRECCION_MS);
          return;
        }
      } catch (err) {
        error = obtenerErrorApi(err, "No pudimos iniciar el pago.");
      }

      // Reintentar solo tiene sentido si el problema fue de la pasarela o de
      // la red, no si el pedido venció o ya no está pendiente.
      const reintento = sePuedeReintentarPago(error)
        ? " Podés reintentarlo desde acá."
        : "";

      irAlDetalle(pedido, {
        tipo: "warning",
        mensaje: `Tu pedido ${numero} quedó registrado, pero no pudimos iniciar el pago. ${mensajeErrorPreferencia(error)}${reintento}`,
      });
      return;
    }

    try {
      await pagoService.registrarContraEntrega(pedido.id);
      irAlDetalle(pedido, {
        tipo: "success",
        mensaje: `¡Gracias por tu compra! Tu pedido ${numero} quedó registrado. Pagás al recibirlo.`,
      });
    } catch (err) {
      const error = obtenerErrorApi(err, "No pudimos registrar el pago.");
      const reintento = sePuedeReintentarContraEntrega(error)
        ? " Reintentalo desde acá."
        : " Comunicate con la tienda.";

      irAlDetalle(pedido, {
        tipo: "warning",
        mensaje: `Tu pedido ${numero} quedó registrado, pero no pudimos registrar el pago contra entrega: ${mensajeErrorContraEntrega(error)}${reintento}`,
      });
    }
  }

  const calculandoEnvio = cargandoCarrito && Boolean(carrito);
  const hayLineasSinStock = items.some(
    (item) => item.cantidad > item.variante.stock,
  );
  const puedeConfirmar =
    !procesando &&
    !cargandoCarrito &&
    !cargandoDirecciones &&
    Boolean(direccionId) &&
    items.length > 0 &&
    !errorEnvio &&
    !hayLineasSinStock;

  async function confirmarPedido(event) {
    event.preventDefault();

    if (procesandoRef.current || !puedeConfirmar) return;

    procesandoRef.current = true;
    setProcesando(true);
    setErrorCompra(null);

    const resultado = await crearPedido({ direccionId, metodoPago });

    if (!resultado.ok || !resultado.pedido) {
      const codigo = resultado.error?.codigo;
      setErrorCompra(describirErrorCreacion(resultado.error, items));

      // El carrito o las direcciones cambiaron en el backend: refrescamos lo
      // que se ve para que coincida (stock real, carrito vacío, etc.).
      // Con un error incierto también: si el pedido sí se creó, el carrito
      // quedó vacío y la página pasa a "Tu carrito está vacío".
      if (
        ["STOCK_INSUFICIENTE", "PRODUCTO_NO_DISPONIBLE", "CARRITO_VACIO", "SIN_COBERTURA"].includes(codigo) ||
        esErrorIncierto(resultado.error)
      ) {
        recargarCarrito();
      }
      if (codigo === "DIRECCION_NO_ENCONTRADA") recargarDirecciones();

      procesandoRef.current = false;
      setProcesando(false);
      return;
    }

    pedidoCreadoRef.current = resultado.pedido.id;
    await iniciarPago(resultado.pedido);
  }

  function elegirDireccion(event) {
    setErrorCompra(null);
    setDireccionElegida(Number(event.target.value));
  }

  function elegirMetodo(event) {
    setErrorCompra(null);
    setMetodoPago(event.target.value);
  }

  if (cargandoDirecciones || (cargandoCarrito && !carrito)) {
    return (
      <main className="checkout">
        <Loading text="Preparando tu compra..." />
      </main>
    );
  }

  if (!carrito) {
    return (
      <main className="checkout">
        <h1 className="checkout__titulo">Finalizar compra</h1>
        <div role="alert">
          <Alert type="error" message={errorCarrito || "No pudimos cargar tu carrito."} />
        </div>
        <Button text="Reintentar" onClick={recargarCarrito} />
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="checkout">
        <h1 className="checkout__titulo">Finalizar compra</h1>
        <section className="checkout__vacio">
          <p className="checkout__vacio-titulo">Tu carrito está vacío</p>
          <p className="checkout__nota">
            Si acabás de confirmar una compra, la encontrás en tus pedidos.
          </p>
          <div className="checkout__enlaces">
            <Link to="/pedidos" className="checkout__link checkout__link--boton">
              Ver mis pedidos
            </Link>
            <Link to="/catalogo" className="checkout__link">
              Seguir comprando
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const opcionesDireccion = direcciones.map((direccion) => ({
    value: String(direccion.id),
    label: describirDireccion(direccion),
  }));

  let textoEnvio = "Sin calcular";
  if (calculandoEnvio) {
    textoEnvio = "Calculando...";
  } else if (direccionId && !errorEnvio) {
    textoEnvio = formatearPrecio(resumen.costoEnvio);
  }

  return (
    <main className="checkout">
      <h1 className="checkout__titulo">Finalizar compra</h1>

      {/* Una sola región viva para los errores de la compra (antes había una
          región dentro de otra y el mensaje se anunciaba dos veces). */}
      <div className="checkout__avisos" role="alert">
        {errorCompra && (
          <div className="checkout__error">
            <Alert type="error" message={errorCompra.mensaje} />
            {errorCompra.accion && (
              <Link to={errorCompra.accion.to} className="checkout__link">
                {errorCompra.accion.texto}
              </Link>
            )}
          </div>
        )}
        {errorCarrito && <Alert type="error" message={errorCarrito} />}
      </div>

      <form className="checkout__layout" onSubmit={confirmarPedido} noValidate>
        <div className="checkout__columna">
          <section className="checkout__card" aria-labelledby="checkout-direccion">
            <h2 id="checkout-direccion" className="checkout__subtitulo">
              Dirección de entrega
            </h2>

            {errorDirecciones ? (
              <Alert type="error" message={errorDirecciones} />
            ) : direcciones.length === 0 ? (
              <p className="checkout__nota">
                Necesitás una dirección de entrega para realizar tu pedido.{" "}
                <Link to="/direcciones" className="checkout__link">
                  Agregar dirección
                </Link>
              </p>
            ) : (
              <Select
                label="Elegí una dirección"
                name="direccionId"
                value={direccionId ? String(direccionId) : ""}
                onChange={elegirDireccion}
                options={opcionesDireccion}
                placeholder="Elegí una dirección"
                required
                disabled={procesando}
              />
            )}

            <div aria-live="polite">
              {errorEnvio && (
                <Alert
                  type="warning"
                  message={`${errorEnvio} Elegí otra dirección para continuar.`}
                />
              )}
            </div>
          </section>

          <fieldset className="checkout__card checkout__metodos" disabled={procesando}>
            <legend className="checkout__subtitulo">Método de pago</legend>

            {METODOS_PAGO.map((metodo) => (
              <label
                key={metodo.valor}
                className={`checkout__metodo${
                  metodoPago === metodo.valor ? " checkout__metodo--activo" : ""
                }`}
              >
                <input
                  type="radio"
                  name="metodoPago"
                  value={metodo.valor}
                  checked={metodoPago === metodo.valor}
                  onChange={elegirMetodo}
                />
                <span className="checkout__metodo-texto">
                  <strong>{metodo.etiqueta}</strong>
                  <span className="checkout__nota">{metodo.descripcion}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <section className="checkout__card" aria-labelledby="checkout-productos">
            <h2 id="checkout-productos" className="checkout__subtitulo">
              Productos ({items.length})
            </h2>

            <ul className="checkout__lineas">
              {items.map((item) => {
                const { variante } = item;
                const sinStock = item.cantidad > variante.stock;

                return (
                  <li key={item.id} className="checkout__linea">
                    <div>
                      <p className="checkout__linea-nombre">{variante.producto.nombre}</p>
                      <p className="checkout__nota">
                        {describirVariante(variante)} · {item.cantidad} ×{" "}
                        {formatearPrecio(variante.producto.precio)}
                      </p>
                      {sinStock && (
                        <p className="checkout__aviso-linea">
                          {variante.stock > 0
                            ? `Solo quedan ${variante.stock} unidades.`
                            : "Sin stock."}
                        </p>
                      )}
                    </div>
                    <p className="checkout__linea-total">
                      {formatearPrecio(variante.producto.precio * item.cantidad)}
                    </p>
                  </li>
                );
              })}
            </ul>

            {hayLineasSinStock && (
              <Alert
                type="warning"
                message="Algunos productos no tienen stock suficiente. Ajustá las cantidades en tu carrito para continuar."
              />
            )}

            <Link to="/carrito" className="checkout__link">
              Modificar carrito
            </Link>
          </section>
        </div>

        <aside className="checkout__card checkout__resumen" aria-label="Resumen de compra">
          <h2 className="checkout__subtitulo">Resumen de compra</h2>

          <dl className="checkout__filas">
            <div className="checkout__fila">
              <dt>Subtotal</dt>
              <dd>{formatearPrecio(resumen.subtotal)}</dd>
            </div>
            <div className="checkout__fila">
              <dt>Envío</dt>
              <dd>{textoEnvio}</dd>
            </div>
            <div className="checkout__fila checkout__fila--total">
              <dt>Total</dt>
              <dd>{formatearPrecio(resumen.total)}</dd>
            </div>
          </dl>

          <p className="checkout__nota">
            El precio de cada producto queda fijo al confirmar el pedido.
          </p>

          <Button
            type="submit"
            text={
              procesando
                ? metodoPago === "MERCADO_PAGO"
                  ? "Redirigiendo a Mercado Pago..."
                  : "Procesando..."
                : "Confirmar pedido"
            }
            disabled={!puedeConfirmar}
          />

          <Link to="/carrito" className="checkout__link">
            Volver al carrito
          </Link>
        </aside>
      </form>
    </main>
  );
}
