
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import useCarrito from "../../hooks/useCarrito";
import usePedidos from "../../hooks/usePedidos";
import direccionService from "../../services/direccion.service";

import {
  crearPreferencia,
  pagarContraEntrega,
} from "../../services/pago.service";



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

 
async function confirmarPedido() {
  if (!direccionId) {
    setError("Selecciona una dirección de entrega.");
    return;
  }

  if (!metodoPago) {
    setError("Selecciona un método de pago.");
    return;
  }

  setError("");
  setProcesando(true);

  try {
    // Crear el pedido antes de iniciar el pago.
    const respuesta = await crearPedido({
      direccionId: Number(direccionId),
      metodoPago,
    });

    const pedido = respuesta?.datos ?? respuesta?.data ?? respuesta;
    const pedidoId = pedido?.id ?? pedido?.pedido?.id;

    if (!pedidoId) {
      throw new Error("No se recibió el identificador del pedido.");
    }

    if (metodoPago === "MERCADO_PAGO") {
      // Redirige al checkout hospedado de Mercado Pago.
      const initPoint = await crearPreferencia(pedidoId);
      window.location.href = initPoint;
      return;
    }

    if (metodoPago === "CONTRA_ENTREGA") {
      await pagarContraEntrega(pedidoId);

      navigate(`/pedidos/${pedidoId}`, {
        state: {
          mensaje: "Pagás al recibir tu pedido.",
        },
      });
      return;
    }

    throw new Error("El método de pago seleccionado no es válido.");
  } catch (err) {
    const mensaje =
      err?.response?.data?.mensaje ??
      err?.response?.data?.message ??
      err.message ??
      "No fue posible procesar el pedido.";

    setError(mensaje);
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

          {error && <p role="alert">{error}</p>}

          <button
            type="submit"
            onClick={confirmarPedido}
 
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
