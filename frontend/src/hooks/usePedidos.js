import { useCallback, useEffect, useRef, useState } from "react";
import pedidoService from "../services/pedido.service";
import pagoService from "../services/pago.service";
import { obtenerErrorApi } from "../services/apiError";
import { CARRITO_ACTUALIZADO_EVENT } from "../services/carrito.service";
import { esUrlDeCheckoutValida } from "../components/orders/pedidoEstados";

const MENSAJE_ERROR_LISTAR =
  "No pudimos cargar tus pedidos. Intentá de nuevo más tarde.";
const MENSAJE_ERROR_CREAR =
  "No pudimos registrar tu pedido. Intentá de nuevo.";
const MENSAJE_ERROR_DETALLE =
  "No pudimos cargar el pedido. Revisá tu conexión e intentá de nuevo.";
const MENSAJE_ERROR_PAGO = "No pudimos iniciar el pago. Intentá de nuevo.";
const MENSAJE_ERROR_CONTRA_ENTREGA =
  "No pudimos registrar el pago contra entrega. Intentá de nuevo.";

// Pedidos por página en "Mis pedidos" (el backend acepta hasta 100).
const PEDIDOS_POR_PAGINA = 10;

// Tiempo tras el que se considera que la redirección a Mercado Pago no
// ocurrió (la página sigue viva) y se libera el botón de pago.
export const ESPERA_REDIRECCION_MS = 8000;

// El pedido vacía el carrito en el backend: avisamos al contador del Header
// (mismo evento que usa useCarrito) con la cantidad ya calculada.
function notificarCarritoVacio() {
  window.dispatchEvent(
    new CustomEvent(CARRITO_ACTUALIZADO_EVENT, { detail: { cantidad: 0 } }),
  );
}

// Pedidos del cliente autenticado (RF-030, RF-031).
//   - pedidos/paginacion/loading/error: lista paginada de SUS pedidos (el
//     backend filtra por la sesión, RN-003).
//   - crearPedido({ direccionId, metodoPago }): crea el pedido desde el
//     carrito. Devuelve { ok, pedido, error } (error = { status, codigo,
//     mensaje, detalles, contexto }) para que el checkout muestre el motivo
//     exacto (stock, cobertura...). Un segundo llamado mientras el primero
//     está en curso se ignora ({ ok: false, ignorado: true }): un doble clic
//     no crea dos pedidos.
//   - `autoCargar`: false para pantallas que solo crean (checkout) y no
//     necesitan la lista.
export function usePedidos({ autoCargar = true } = {}) {
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState({ pedidos: [], paginacion: null });
  const [loading, setLoading] = useState(autoCargar);
  const [error, setError] = useState("");
  const [procesando, setProcesando] = useState(false);

  // Mismo patrón que pedidoRef en useZonasCobertura: cada carga lleva un
  // número y solo la más reciente puede escribir el estado (una respuesta
  // tardía de otra página no pisa a la actual).
  const solicitudRef = useRef(0);
  // Bloqueo síncrono de la creación: `procesando` (estado) no cambia entre
  // dos clics del mismo render, el ref sí.
  const procesandoRef = useRef(false);

  const cargar = useCallback((paginaACargar) => {
    const solicitud = ++solicitudRef.current;
    const vigente = () => solicitud === solicitudRef.current;

    return pedidoService
      .listarPedidos({ pagina: paginaACargar, limite: PEDIDOS_POR_PAGINA })
      .then((data) => {
        if (!vigente()) return;
        setDatos({
          pedidos: Array.isArray(data?.pedidos) ? data.pedidos : [],
          paginacion: data?.paginacion ?? null,
        });
        setError("");
      })
      .catch((err) => {
        if (vigente()) {
          setError(obtenerErrorApi(err, MENSAJE_ERROR_LISTAR).mensaje);
        }
      })
      .finally(() => {
        if (vigente()) setLoading(false);
      });
  }, []);

  // Carga inicial y al cambiar de página. El estado solo cambia dentro de los
  // callbacks de la promesa (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!autoCargar) return undefined;

    cargar(pagina);

    return () => {
      // Invalida lo que esté en vuelo al desmontar o cambiar de página.
      solicitudRef.current += 1;
    };
  }, [autoCargar, pagina, cargar]);

  const cambiarPagina = useCallback(
    (nueva) => {
      const total = datos.paginacion?.totalPaginas ?? 1;
      if (nueva < 1 || nueva > total || nueva === pagina) return;

      setLoading(true);
      setPagina(nueva);
    },
    [datos.paginacion, pagina],
  );

  const recargar = useCallback(() => {
    setLoading(true);
    setError("");

    return cargar(pagina);
  }, [cargar, pagina]);

  const crearPedido = useCallback(
    async ({ direccionId, metodoPago }) => {
      if (procesandoRef.current) {
        return { ok: false, ignorado: true, pedido: null, error: null };
      }

      procesandoRef.current = true;
      setProcesando(true);

      let resultado;

      try {
        const data = await pedidoService.crearPedido({ direccionId, metodoPago });
        notificarCarritoVacio();
        resultado = { ok: true, pedido: data?.pedido ?? null, error: null };
      } catch (err) {
        resultado = {
          ok: false,
          pedido: null,
          error: obtenerErrorApi(err, MENSAJE_ERROR_CREAR),
        };
      }

      // La lista (si se muestra) refleja siempre al backend, haya salido bien
      // o no (ej. un pedido creado aunque la respuesta se perdiera).
      if (autoCargar) await cargar(pagina);

      procesandoRef.current = false;
      setProcesando(false);

      return resultado;
    },
    [autoCargar, cargar, pagina],
  );

  return {
    pedidos: datos.pedidos,
    paginacion: datos.paginacion,
    pagina,
    cambiarPagina,
    loading,
    error,
    recargar,
    crearPedido,
    procesando,
  };
}

// Pedido del cliente con su seguimiento (RF-028, RF-031) y las acciones de
// pago que le corresponden (RF-034, RF-037). El cliente NO cancela pedidos
// (PATCH /cancelar es solo del personal: responde 403).
//   - pedido/seguimiento/loading/error: `error` = { status, codigo, mensaje }
//     de la última carga fallida (un 404 es "no existe o no es tuyo").
//   - actualizando: hay una recarga en curso (botón "Actualizar").
//   - iniciarPagoMercadoPago(): pide la preferencia y devuelve { ok,
//     checkoutUrl, error }; la redirección la hace la página.
//   - registrarContraEntrega(): reintenta el registro del pago contra entrega
//     si falló en el checkout.
// Cada acción recarga el pedido al terminar, también si falla (ej. 409
// PEDIDO_VENCIDO), porque la verdad está en el backend.
export function usePedidoDetalle(id) {
  // { id, pedido, seguimiento, error } de la última carga aplicada.
  const [estado, setEstado] = useState(null);
  const [actualizando, setActualizando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [errorAccion, setErrorAccion] = useState(null);

  const solicitudRef = useRef(0);
  const procesandoRef = useRef(false);
  // Temporizador que libera el bloqueo si la redirección a Mercado Pago no
  // llegó a ocurrir.
  const temporizadorRef = useRef(null);

  useEffect(() => () => window.clearTimeout(temporizadorRef.current), []);

  const cargar = useCallback((idPedido) => {
    const solicitud = ++solicitudRef.current;
    const vigente = () => solicitud === solicitudRef.current;

    // El seguimiento es secundario: si falla (ej. 404 ENVIO_NO_REGISTRADO)
    // el detalle se muestra igual, con el estado del pedido.
    return Promise.allSettled([
      pedidoService.obtenerPorId(idPedido),
      pedidoService.obtenerSeguimiento(idPedido),
    ]).then(([pedido, seguimiento]) => {
      if (!vigente()) return;

      setEstado((previo) => {
        const mismoPedido = previo?.id === idPedido;

        if (pedido.status === "rejected") {
          return {
            id: idPedido,
            // Si ya lo teníamos, no lo borramos por una recarga fallida.
            pedido: mismoPedido ? previo.pedido : null,
            seguimiento: mismoPedido ? previo.seguimiento : null,
            error: obtenerErrorApi(pedido.reason, MENSAJE_ERROR_DETALLE),
          };
        }

        return {
          id: idPedido,
          pedido: pedido.value,
          seguimiento:
            seguimiento.status === "fulfilled" ? seguimiento.value : null,
          error: null,
        };
      });
    });
  }, []);

  useEffect(() => {
    cargar(id);

    return () => {
      solicitudRef.current += 1;
    };
  }, [id, cargar]);

  // Si la persona vuelve desde Mercado Pago con "Atrás" y el navegador
  // restaura la página desde su caché (bfcache), liberamos el bloqueo que
  // quedó tomado al redirigir y recargamos el estado real del pedido.
  useEffect(() => {
    function alVolver(event) {
      if (!event.persisted) return;

      window.clearTimeout(temporizadorRef.current);
      procesandoRef.current = false;
      setProcesando(false);
      cargar(id);
    }

    window.addEventListener("pageshow", alVolver);
    return () => window.removeEventListener("pageshow", alVolver);
  }, [id, cargar]);

  const recargar = useCallback(async () => {
    setActualizando(true);
    await cargar(id);
    setActualizando(false);
  }, [cargar, id]);

  const ejecutar = useCallback(
    async (accion, mensajePorDefecto) => {
      if (procesandoRef.current) {
        return { ok: false, ignorado: true, datos: null, error: null };
      }

      procesandoRef.current = true;
      setProcesando(true);
      setErrorAccion(null);

      let resultado;

      try {
        resultado = { ok: true, datos: await accion(), error: null };
      } catch (err) {
        const detalle = obtenerErrorApi(err, mensajePorDefecto);
        setErrorAccion(detalle);
        resultado = { ok: false, datos: null, error: detalle };
      }

      return resultado;
    },
    [],
  );

  const liberar = useCallback(() => {
    procesandoRef.current = false;
    setProcesando(false);
  }, []);

  const iniciarPagoMercadoPago = useCallback(async () => {
    const resultado = await ejecutar(
      () => pagoService.crearPreferencia(Number(id)),
      MENSAJE_ERROR_PAGO,
    );

    if (resultado.ignorado) return resultado;

    const checkoutUrl = resultado.datos?.checkoutUrl;

    // Una URL que no es de Mercado Pago (o no es https) se trata igual que
    // una URL ausente: no se redirige.
    if (resultado.ok && esUrlDeCheckoutValida(checkoutUrl)) {
      // Se mantiene el bloqueo mientras la página navega a Mercado Pago, así
      // un segundo clic no pide otra preferencia. Si a los
      // ESPERA_REDIRECCION_MS la página sigue viva (la navegación no ocurrió)
      // se libera para que el botón vuelva a estar disponible.
      window.clearTimeout(temporizadorRef.current);
      temporizadorRef.current = window.setTimeout(liberar, ESPERA_REDIRECCION_MS);
      return { ok: true, checkoutUrl, error: null };
    }

    const error = resultado.error ?? {
      status: 502,
      codigo: "PASARELA_NO_DISPONIBLE",
      mensaje: "Mercado Pago no devolvió la URL de pago.",
      detalles: [],
      contexto: null,
    };
    if (!resultado.error) setErrorAccion(error);

    await cargar(id);
    liberar();

    return { ok: false, checkoutUrl: null, error };
  }, [cargar, ejecutar, id, liberar]);

  const registrarContraEntrega = useCallback(async () => {
    const resultado = await ejecutar(
      () => pagoService.registrarContraEntrega(Number(id)),
      MENSAJE_ERROR_CONTRA_ENTREGA,
    );

    if (resultado.ignorado) return resultado;

    await cargar(id);
    liberar();

    return resultado;
  }, [cargar, ejecutar, id, liberar]);

  const limpiarErrorAccion = useCallback(() => setErrorAccion(null), []);

  const vigente = estado?.id === id ? estado : null;

  return {
    pedido: vigente?.pedido ?? null,
    seguimiento: vigente?.seguimiento ?? null,
    // true hasta la primera respuesta para este id.
    loading: vigente === null,
    error: vigente?.error ?? null,
    actualizando,
    recargar,
    procesando,
    errorAccion,
    limpiarErrorAccion,
    iniciarPagoMercadoPago,
    registrarContraEntrega,
  };
}
