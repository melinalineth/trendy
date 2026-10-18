
import { useEffect, useState } from "react";
import ventasService from "../services/ventas.service";

const LIMITE_POR_DEFECTO = 50;

const PAGINACION_INICIAL = {
  pagina: 1,
  limite: LIMITE_POR_DEFECTO,
  total: 0,
  totalPaginas: 1,
};

const FILTROS_INICIALES = {
  desde: "",
  hasta: "",
  estado: "",
};

const MENSAJE_ERROR_LISTAR = "No fue posible cargar las ventas. Intenta nuevamente.";

const obtenerMensajeError = (error) => {
  const estadoHttp = error?.response?.status;

  if (estadoHttp === 400) {
    const detalles = error?.response?.data?.error?.detalles;

    if (Array.isArray(detalles)) {
      return detalles
        .map((detalle) =>
          typeof detalle === "string"
            ? detalle
            : detalle?.message ?? detalle?.mensaje ?? ""
        )
        .filter(Boolean)
        .join(". ") || "Los filtros seleccionados no son válidos.";
    }

    if (typeof detalles === "string" && detalles.trim()) {
      return detalles;
    }

    return "Los filtros seleccionados no son válidos.";
  }

  if (estadoHttp === 403) {
    return "No tenés permisos para ver las ventas";
  }

  return MENSAJE_ERROR_LISTAR;
};

const validarRangoFechas = ({ desde, hasta }) => {
  if (!desde || !hasta) return "";

  // Comparar YYYY-MM-DD como fechas de calendario, sin depender
  // de la zona horaria local.
  if (desde > hasta) {
    return "La fecha desde no puede ser posterior a la fecha hasta.";
  }

  return "";
};

function useVentas() {
  const [ventas, setVentas] = useState([]);
  const [paginacion, setPaginacion] = useState(PAGINACION_INICIAL);
  const [totales, setTotales] = useState(undefined);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [paginaSolicitada, setPaginaSolicitada] = useState(1);
  const [recarga, setRecarga] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;

    const cargarVentas = async () => {
      const errorFechas = validarRangoFechas(filtros);

      if (errorFechas) {
        setVentas([]);
        setTotales(undefined);
        setError(errorFechas);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const parametros = {
          pagina: paginaSolicitada,
          limite: paginacion.limite || LIMITE_POR_DEFECTO,
          desde: filtros.desde,
          hasta: filtros.hasta,
          estado: filtros.estado,
        };

        // El servicio debe omitir los filtros vacíos.
        const respuesta = await ventasService.listar(parametros);
        const datos = respuesta?.data ?? respuesta;

        if (!activo) return;

        setVentas(
          datos?.ventas ??
            datos?.datos ??
            datos?.items ??
            []
        );

        const nuevaPaginacion = datos?.paginacion ?? {};

        setPaginacion({
          pagina: nuevaPaginacion.pagina ?? paginaSolicitada,
          limite: nuevaPaginacion.limite ?? LIMITE_POR_DEFECTO,
          total: nuevaPaginacion.total ?? 0,
          totalPaginas: nuevaPaginacion.totalPaginas ?? 1,
        });

        setTotales(datos?.totales);
      } catch (errorConsulta) {
        if (!activo) return;

        setVentas([]);
        setTotales(undefined);
        setError(obtenerMensajeError(errorConsulta));
      } finally {
        if (activo) {
          setLoading(false);
        }
      }
    };

    cargarVentas();

    return () => {
      activo = false;
    };
  }, [filtros, paginaSolicitada, recarga]);

  const aplicarFiltros = (nuevosFiltros = {}) => {
    setFiltros({
      desde: nuevosFiltros.desde ?? "",
      hasta: nuevosFiltros.hasta ?? "",
      estado:
        !nuevosFiltros.estado || nuevosFiltros.estado === "TODAS"
          ? ""
          : nuevosFiltros.estado,
    });

    setPaginaSolicitada(1);
  };

  const limpiarFiltros = () => {
    setFiltros(FILTROS_INICIALES);
    setPaginaSolicitada(1);
  };

  const cambiarPagina = (nuevaPagina) => {
    const pagina = Number(nuevaPagina);

    if (
      !Number.isInteger(pagina) ||
      pagina < 1 ||
      pagina > paginacion.totalPaginas
    ) {
      return;
    }

    setPaginaSolicitada(pagina);
  };

  const recargar = () => {
    setRecarga((actual) => actual + 1);
  };

  return {
    ventas,
    paginacion,
    totales,
    filtros,
    loading,
    error,
    aplicarFiltros,
    limpiarFiltros,
    cambiarPagina,
    recargar,
  };
}

export default useVentas;
