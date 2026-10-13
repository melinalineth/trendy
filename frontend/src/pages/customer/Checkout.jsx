
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import useCarrito from "../../hooks/useCarrito";
import usePedidos from "../../hooks/usePedidos";
import direccionService from "../../services/direccion.service";

export default function Checkout() {
  const navigate = useNavigate();

  const carritoHook = useCarrito();
  const { crearPedido } = usePedidos();

  const [direcciones, setDirecciones] = useState([]);
  const [direccionId, setDireccionId] = useState("");
  const [metodoPago, setMetodoPago] = useState("MERCADO_PAGO");
  const [resumenPedido, setResumenPedido] = useState(null);

  const [cargandoDirecciones, setCargandoDirecciones] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    let activo = true;

    async function cargarDirecciones() {
      try {
        const respuesta = await direccionService.listarPropias();
        const lista = Array.isArray(respuesta)
          ? respuesta
          : respuesta?.datos || [];

        if (!activo) return;

        setDirecciones(lista);

        if (lista.length > 0) {
          setDireccionId(String(lista[0].id));
        }
      } catch (err) {
        if (activo) {
          setError(
            err.response?.data?.mensaje ||
              "No se pudieron cargar tus direcciones."
          );
        }
      } finally {
        if (activo) setCargandoDirecciones(false);
      }
    }

    cargarDirecciones();

    return () => {
      activo = false;
    };
  }, []);

  const direccionSeleccionada = direcciones.find(
    (direccion) => String(direccion.id) === String(direccionId)
  );

  const permiteContraEntrega = Boolean(
    direccionSeleccionada?.permiteContraEntrega ??
      direccionSeleccionada?.zonaCobertura?.permiteContraEntrega
  );

  useEffect(() => {
    if (metodoPago === "CONTRA_ENTREGA" && !permiteContraEntrega) {
      setMetodoPago("MERCADO_PAGO");
    }
  }, [metodoPago, permiteContraEntrega]);

  useEffect(() => {
    let activo = true;

    async function cargarResumen() {
      if (!direccionId) {
        setResumenPedido(null);
        return;
      }

      try {
        setError("");

        // Reutiliza el método resumen del hook del carrito.
        const resultado = await carritoHook.resumen(Number(direccionId));

        if (activo) {
          setResumenPedido(resultado?.datos ?? resultado);
        }
      } catch (err) {
        if (activo) {
          setResumenPedido(null);
          setError(
            err.response?.data?.mensaje ||
              "No se pudo calcular el total del pedido."
          );
        }
      }
    }

    cargarResumen();

    return () => {
      activo = false;
    };
  }, [direccionId]);

  function formatoCOP(valor) {
    return Number(valor || 0).toLocaleString("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    });
  }

  async function confirmarPedido(evento) {
    evento.preventDefault();
    setError("");
    setMensaje("");

    if (!direccionId) {
      setError("Selecciona una dirección de entrega.");
      return;
    }

    if (!resumenPedido) {
      setError("Espera a que se calcule el total del pedido.");
      return;
    }

    if (metodoPago === "CONTRA_ENTREGA" && !permiteContraEntrega) {
      setError(
        "El pago contra entrega no está disponible para esta dirección."
      );
      return;
    }

    setProcesando(true);

    try {
      const respuesta = await crearPedido({
        direccionId: Number(direccionId),
        metodoPago,
      });

      const pedido = respuesta?.datos ?? respuesta?.pedido ?? respuesta;
      const pedidoId = pedido?.id;

      if (!pedidoId) {
        throw new Error(
          "El pedido se creó, pero no se recibió su identificador."
        );
      }

      if (metodoPago === "MERCADO_PAGO") {
        const pagoRespuesta = await axios.post(
          "/api/v1/pagos/mercadopago/preferencia",
          { pedidoId }
        );

        const pago = pagoRespuesta.data?.datos ?? pagoRespuesta.data;
        const checkoutUrl = pago?.checkoutUrl || pago?.init_point;

        if (!checkoutUrl) {
          throw new Error(
            "El pedido se creó, pero no se recibió el enlace de pago."
          );
        }

        window.location.assign(checkoutUrl);
        return;
      }

      setMensaje("¡Pedido confirmado! Pagarás al recibirlo.");
      navigate(`/pedidos/${pedidoId}`, {
        state: { mensaje: "Pedido creado con pago contra entrega." },
      });
    } catch (err) {
      if (err.response?.status === 409) {
        setError(
          err.response?.data?.mensaje ||
            "No se puede completar el pedido con esa modalidad de pago. Revisa la disponibilidad e inténtalo de nuevo."
        );
      } else {
        setError(
          err.response?.data?.mensaje ||
            err.message ||
            "No se pudo confirmar el pedido."
        );
      }
    } finally {
      setProcesando(false);
    }
  }

  if (cargandoDirecciones) {
    return <main className="checkout"><p>Cargando direcciones...</p></main>;
  }

  return (
    <main className="checkout">
      <h1>Finalizar compra</h1>

      {error && <p role="alert" className="checkout__error">{error}</p>}
      {mensaje && <p role="status" className="checkout__success">{mensaje}</p>}

      {direcciones.length === 0 ? (
        <section>
          <p>Necesitas una dirección de entrega para realizar tu pedido.</p>
          <button type="button" onClick={() => navigate("/direcciones")}>
            Agregar dirección
          </button>
        </section>
      ) : (
        <form onSubmit={confirmarPedido}>
          <section>
            <h2>Dirección de entrega</h2>

            <label htmlFor="direccionId">Selecciona una dirección</label>
            <select
              id="direccionId"
              value={direccionId}
              onChange={(evento) => setDireccionId(evento.target.value)}
              required
            >
              {direcciones.map((direccion) => (
                <option key={direccion.id} value={direccion.id}>
                  {direccion.nombre ||
                    direccion.direccion ||
                    direccion.direccionCompleta ||
                    `Dirección ${direccion.id}`}
                  {direccion.ciudad ? ` — ${direccion.ciudad}` : ""}
                </option>
              ))}
            </select>
          </section>

          <section>
            <h2>Resumen de compra</h2>

            <p>
              Subtotal:{" "}
              <strong>{formatoCOP(resumenPedido?.subtotal)}</strong>
            </p>
            <p>
              Envío:{" "}
              <strong>{formatoCOP(resumenPedido?.costoEnvio)}</strong>
            </p>
            <p>
              Total:{" "}
              <strong>{formatoCOP(resumenPedido?.total)}</strong>
            </p>
          </section>

          <section>
            <h2>Método de pago</h2>

            <label>
              <input
                type="radio"
                name="metodoPago"
                value="MERCADO_PAGO"
                checked={metodoPago === "MERCADO_PAGO"}
                onChange={(evento) => setMetodoPago(evento.target.value)}
              />
              Mercado Pago
            </label>

            {permiteContraEntrega && (
              <label>
                <input
                  type="radio"
                  name="metodoPago"
                  value="CONTRA_ENTREGA"
                  checked={metodoPago === "CONTRA_ENTREGA"}
                  onChange={(evento) => setMetodoPago(evento.target.value)}
                />
                Pago contra entrega
              </label>
            )}

            {!permiteContraEntrega && direccionId && (
              <p>
                El pago contra entrega no está disponible para esta dirección.
              </p>
            )}
          </section>

          <button
            type="submit"
            disabled={
              procesando ||
              !direccionId ||
              !resumenPedido ||
              Number(resumenPedido?.total) < 0
            }
          >
            {procesando ? "Procesando..." : "Confirmar pedido"}
          </button>
        </form>
      )}
    </main>
  );
}
