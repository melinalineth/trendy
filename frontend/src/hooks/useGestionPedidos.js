import { useCallback, useEffect, useRef, useState } from "react";
import pedidoService from "../services/pedido.service";
import pagoService from "../services/pago.service";
import { obtenerErrorApi } from "../services/apiError";

const MENSAJE_ERROR_LISTAR =
  "No pudimos cargar los pedidos. Intentá de nuevo.";
const MENSAJE_ERROR_DETALLE =
  "No pudimos cargar el detalle del pedido. Intentá de nuevo.";
const MENSAJE_ERROR_ESTADO =
  "No pudimos actualizar el estado del pedido. Intentá de nuevo.";
const MENSAJE_ERROR_ENVIO =
  "No pudimos actualizar el estado del envío. Intentá de nuevo.";
const MENSAJE_ERROR_CANCELAR =
  "No pudimos cancelar el pedido. Intentá de nuevo.";
const MENSAJE_ERROR_COBRO =
  "No pudimos registrar el cobro contra entrega. Intentá de nuevo.";
const MENSAJE_ERROR_VENCIDOS =
  "No pudimos cancelar los pedidos vencidos. Intentá de nuevo.";

const PEDIDOS_POR_PAGINA = 20;

export const FILTROS_VACIOS = Object.freeze({
  estado: "",
  numero: "",
  usuarioId: "",
  desde: "",
  hasta: "",
});

// Gestión de pedidos para admin y vendedor (RF-032, RF-029, RF-037).
//   - filtros/cambiarFiltro: borrador del formulario de filtros; se aplican
//     con aplicarFiltros() (vuelve a la página 1) y limpiarFiltros().
//   - pedidos/paginacion/pagina/cambiarPagina/loading/error: listado.
//   - detalle/verDetalle/cerrarDetalle: pedido completo (con pago e
//     infoEnvio, que el listado no trae) del pedido seleccionado.
//   - Mutaciones (cambiarEstadoPedido, cambiarEstadoEnvio, cancelarPedido,
//     confirmarRecepcion, cancelarVencidos): devuelven { ok, datos, error }
//     (error = { status, codigo, mensaje, detalles, contexto }). Mientras una
//     está en curso las demás se ignoran (doble clic) y al terminar, salga
//     bien o mal, se recargan la lista y el detalle abierto: la verdad está
//     en el backend (otra persona del equipo pudo moverlo antes).
export function useGestionPedidos() {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  // Lo que efectivamente se consultó. Siempre es un objeto nuevo al aplicar,
  // así el efecto de carga corre aunque los valores no cambien.
  const [consulta, setConsulta] = useState({ filtros: FILTROS_VACIOS, pagina: 1 });
  const [datos, setDatos] = useState({ pedidos: [], paginacion: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detalle, setDetalle] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [errorAccion, setErrorAccion] = useState(null);

  // Contadores contra respuestas tardías (mismo patrón que pedidoRef en
  // useZonasCobertura), uno para la lista y otro para el detalle.
  const solicitudRef = useRef(0);
  const solicitudDetalleRef = useRef(0);
  const procesandoRef = useRef(false);
  // Consulta y pedido abierto vigentes, para que una mutación que termina
  // después de un cambio de página o de detalle recargue lo actual.
  const consultaRef = useRef(consulta);
  const detalleIdRef = useRef(null);

  useEffect(() => {
    consultaRef.current = consulta;
  }, [consulta]);

  const cargarLista = useCallback((consultaACargar) => {
    const solicitud = ++solicitudRef.current;
    const vigente = () => solicitud === solicitudRef.current;

    return pedidoService
      .listarPedidos({
        ...consultaACargar.filtros,
        pagina: consultaACargar.pagina,
        limite: PEDIDOS_POR_PAGINA,
      })
      .then((data) => {
        if (!vigente()) return;

        const pedidos = Array.isArray(data?.pedidos) ? data.pedidos : [];
        const paginacion = data?.paginacion ?? null;
        const totalPaginas = paginacion?.totalPaginas ?? 0;

        // La página quedó vacía (ej. se canceló el único pedido de la última
        // página con un filtro de estado): saltamos a la última que existe.
        if (pedidos.length === 0 && consultaACargar.pagina > 1 && totalPaginas >= 1) {
          setConsulta((previa) => ({ ...previa, pagina: totalPaginas }));
          return;
        }

        setDatos({ pedidos, paginacion });
        setError("");
        setLoading(false);
      })
      .catch((err) => {
        if (!vigente()) return;
        setError(obtenerErrorApi(err, MENSAJE_ERROR_LISTAR).mensaje);
        setLoading(false);
      });
  }, []);

  // Carga inicial y cada vez que cambia la consulta (filtros aplicados o
  // página). El estado solo cambia en callbacks de la promesa.
  useEffect(() => {
    cargarLista(consulta);

    return () => {
      solicitudRef.current += 1;
    };
  }, [consulta, cargarLista]);

  const cargarDetalle = useCallback((id) => {
    const solicitud = ++solicitudDetalleRef.current;
    const vigente = () => solicitud === solicitudDetalleRef.current;

    return pedidoService
      .obtenerPorId(id)
      .then((pedido) => {
        if (vigente()) setDetalle({ id, pedido, error: null });
      })
      .catch((err) => {
        if (!vigente()) return;
        setDetalle((previo) => ({
          id,
          pedido: previo?.id === id ? previo.pedido : null,
          error: obtenerErrorApi(err, MENSAJE_ERROR_DETALLE),
        }));
      });
  }, []);

  useEffect(
    () => () => {
      // Al desmontar, ninguna respuesta pendiente del detalle escribe estado.
      solicitudDetalleRef.current += 1;
    },
    [],
  );

  const cambiarFiltro = useCallback((campo, valor) => {
    setFiltros((actuales) => ({ ...actuales, [campo]: valor }));
  }, []);

  const aplicarFiltros = useCallback(() => {
    setLoading(true);
    setConsulta({ filtros: { ...filtros }, pagina: 1 });
  }, [filtros]);

  const limpiarFiltros = useCallback(() => {
    setFiltros(FILTROS_VACIOS);
    setLoading(true);
    setConsulta({ filtros: FILTROS_VACIOS, pagina: 1 });
  }, []);

  const cambiarPagina = useCallback(
    (nueva) => {
      const total = datos.paginacion?.totalPaginas ?? 1;
      if (nueva < 1 || nueva > total || nueva === consulta.pagina) return;

      setLoading(true);
      setConsulta((previa) => ({ ...previa, pagina: nueva }));
    },
    [datos.paginacion, consulta.pagina],
  );

  const recargar = useCallback(() => {
    setLoading(true);
    setError("");

    return cargarLista(consultaRef.current);
  }, [cargarLista]);

  const verDetalle = useCallback(
    (id) => {
      detalleIdRef.current = id;
      setErrorAccion(null);
      setDetalle({ id, pedido: null, error: null });

      return cargarDetalle(id);
    },
    [cargarDetalle],
  );

  const recargarDetalle = useCallback(() => {
    if (detalleIdRef.current === null) return Promise.resolve();
    return cargarDetalle(detalleIdRef.current);
  }, [cargarDetalle]);

  const cerrarDetalle = useCallback(() => {
    detalleIdRef.current = null;
    solicitudDetalleRef.current += 1;
    setErrorAccion(null);
    setDetalle(null);
  }, []);

  const limpiarErrorAccion = useCallback(() => setErrorAccion(null), []);

  const ejecutarMutacion = useCallback(
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
        const detalleError = obtenerErrorApi(err, mensajePorDefecto);
        setErrorAccion(detalleError);
        resultado = { ok: false, datos: null, error: detalleError };
      }

      try {
        await Promise.all([
          cargarLista(consultaRef.current),
          detalleIdRef.current !== null
            ? cargarDetalle(detalleIdRef.current)
            : null,
        ]);
      } finally {
        procesandoRef.current = false;
        setProcesando(false);
      }

      return resultado;
    },
    [cargarLista, cargarDetalle],
  );

  // PATCH /pedidos/:id/estado (CONFIRMADO, EN_PREPARACION...).
  const cambiarEstadoPedido = useCallback(
    (id, estado) =>
      ejecutarMutacion(
        () => pedidoService.actualizarEstado(id, estado),
        MENSAJE_ERROR_ESTADO,
      ),
    [ejecutarMutacion],
  );

  // PUT /pedidos/:id/estado-envio (ENVIADO, EN_TRANSITO, ENTREGADO).
  const cambiarEstadoEnvio = useCallback(
    (id, estadoEnvio) =>
      ejecutarMutacion(
        () => pedidoService.actualizarEstadoEnvio(id, estadoEnvio),
        MENSAJE_ERROR_ENVIO,
      ),
    [ejecutarMutacion],
  );

  // PATCH /pedidos/:id/cancelar: datos = { mensaje, yaCancelado, pedido }.
  const cancelarPedido = useCallback(
    (id) =>
      ejecutarMutacion(
        () => pedidoService.cancelarPedido(id),
        MENSAJE_ERROR_CANCELAR,
      ),
    [ejecutarMutacion],
  );

  // PATCH /pagos/:pedidoId/confirmar-recepcion (contra entrega cobrado).
  const confirmarRecepcion = useCallback(
    (id) =>
      ejecutarMutacion(
        () => pagoService.confirmarRecepcion(id),
        MENSAJE_ERROR_COBRO,
      ),
    [ejecutarMutacion],
  );

  // POST /pedidos/vencidos/cancelar (solo admin): datos = { horas, corte,
  // cancelados, omitidos }.
  const cancelarVencidos = useCallback(
    () =>
      ejecutarMutacion(
        () => pedidoService.cancelarVencidos(),
        MENSAJE_ERROR_VENCIDOS,
      ),
    [ejecutarMutacion],
  );

  return {
    filtros,
    cambiarFiltro,
    aplicarFiltros,
    limpiarFiltros,
    pedidos: datos.pedidos,
    paginacion: datos.paginacion,
    pagina: consulta.pagina,
    cambiarPagina,
    loading,
    error,
    recargar,
    detalle,
    verDetalle,
    recargarDetalle,
    cerrarDetalle,
    procesando,
    errorAccion,
    limpiarErrorAccion,
    cambiarEstadoPedido,
    cambiarEstadoEnvio,
    cancelarPedido,
    confirmarRecepcion,
    cancelarVencidos,
  };
}
