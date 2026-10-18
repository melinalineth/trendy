import { useCallback, useEffect, useRef, useState } from "react";
import ventaService from "../services/venta.service";
import { obtenerErrorApi } from "../services/apiError";

const MENSAJE_ERROR_LISTAR =
  "No pudimos cargar las ventas. Intentá de nuevo.";
const MENSAJE_SIN_PERMISOS = "No tenés permisos para ver las ventas.";
const MENSAJE_FILTROS_INVALIDOS = "Los filtros seleccionados no son válidos.";
const MENSAJE_RANGO_FECHAS =
  "La fecha «desde» no puede ser posterior a «hasta».";

// Máximo de filas por página. El Pagination común dibuja un botón por página:
// con 50 por página un historial largo sigue siendo manejable.
const VENTAS_POR_PAGINA = 50;

export const FILTROS_VACIOS = Object.freeze({
  desde: "",
  hasta: "",
  estado: "",
});

const DATOS_VACIOS = Object.freeze({
  ventas: [],
  paginacion: null,
  totales: null,
});

// `detalles` de un 400 puede traer strings o objetos { message | mensaje }
// (obtenerErrorApi solo conserva los strings).
function leerDetalles(err) {
  const detalles = err?.response?.data?.error?.detalles;

  if (!Array.isArray(detalles)) return [];

  return detalles
    .map((detalle) =>
      typeof detalle === "string"
        ? detalle
        : (detalle?.message ?? detalle?.mensaje ?? ""),
    )
    .filter(Boolean);
}

function mensajeDeError(err) {
  const info = obtenerErrorApi(err, MENSAJE_ERROR_LISTAR);

  if (info.status === 403) return MENSAJE_SIN_PERMISOS;

  if (info.status === 400) {
    const detalles = leerDetalles(err);
    return detalles.length > 0 ? detalles.join(". ") : MENSAJE_FILTROS_INVALIDOS;
  }

  return info.mensaje;
}

// Devuelve el mensaje de error de los filtros, o "" si son válidos (misma
// regla que el backend, para no ir a buscar un 400). Las fechas son
// AAAA-MM-DD: se comparan como texto, sin depender de la zona horaria.
function validarFiltros(filtros) {
  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
    return MENSAJE_RANGO_FECHAS;
  }

  return "";
}

// Consulta de ventas para admin y vendedor (RF-042).
//   - filtros/cambiarFiltro: borrador del formulario de filtros; se aplican
//     con aplicarFiltros() (valida y vuelve a la página 1) y limpiarFiltros().
//     errorFiltros es el mensaje de validación del borrador ("" si no hay).
//   - ventas/paginacion/pagina/cambiarPagina/loading/error: listado de la
//     consulta vigente. `error` es un texto listo para mostrar.
//   - totales: { registradas, anuladas } con cantidad y total de TODAS las
//     ventas que cumplen los filtros (no solo la página), o null si no hay.
export function useVentas() {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [errorFiltros, setErrorFiltros] = useState("");
  // Lo que efectivamente se consultó. Siempre es un objeto nuevo al aplicar,
  // así el efecto de carga corre aunque los valores no cambien.
  const [consulta, setConsulta] = useState({ filtros: FILTROS_VACIOS, pagina: 1 });
  const [datos, setDatos] = useState(DATOS_VACIOS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Contador contra respuestas tardías (mismo patrón que useGestionPedidos).
  const solicitudRef = useRef(0);
  const consultaRef = useRef(consulta);

  useEffect(() => {
    consultaRef.current = consulta;
  }, [consulta]);

  const cargarLista = useCallback((consultaACargar) => {
    const solicitud = ++solicitudRef.current;
    const vigente = () => solicitud === solicitudRef.current;

    return ventaService
      .listarVentas({
        ...consultaACargar.filtros,
        pagina: consultaACargar.pagina,
        limite: VENTAS_POR_PAGINA,
      })
      .then((data) => {
        if (!vigente()) return;

        const ventas = Array.isArray(data?.ventas) ? data.ventas : [];
        const paginacion = data?.paginacion ?? null;
        const totalPaginas = paginacion?.totalPaginas ?? 0;

        // La página pedida quedó más allá de la última (hay menos ventas que
        // antes, ej. por un refresco): saltamos a la última que existe. Exigir
        // totalPaginas < pagina evita un bucle de requests si el backend
        // devuelve una página vacía que no pasa del total.
        if (
          ventas.length === 0 &&
          consultaACargar.pagina > 1 &&
          totalPaginas >= 1 &&
          totalPaginas < consultaACargar.pagina
        ) {
          setConsulta((previa) => ({ ...previa, pagina: totalPaginas }));
          return;
        }

        setDatos({ ventas, paginacion, totales: data?.totales ?? null });
        setError("");
        setLoading(false);
      })
      .catch((err) => {
        if (!vigente()) return;
        // Sin datos viejos: no corresponden a los filtros que fallaron.
        setDatos(DATOS_VACIOS);
        setError(mensajeDeError(err));
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

  const cambiarFiltro = useCallback((campo, valor) => {
    setFiltros((actuales) => ({ ...actuales, [campo]: valor }));
  }, []);

  const aplicarFiltros = useCallback(() => {
    const mensaje = validarFiltros(filtros);
    setErrorFiltros(mensaje);
    if (mensaje) return;

    setLoading(true);
    setConsulta({ filtros: { ...filtros }, pagina: 1 });
  }, [filtros]);

  const limpiarFiltros = useCallback(() => {
    setFiltros(FILTROS_VACIOS);
    setErrorFiltros("");
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

  return {
    filtros,
    cambiarFiltro,
    aplicarFiltros,
    limpiarFiltros,
    errorFiltros,
    ventas: datos.ventas,
    paginacion: datos.paginacion,
    totales: datos.totales,
    pagina: consulta.pagina,
    cambiarPagina,
    loading,
    error,
    recargar,
  };
}
