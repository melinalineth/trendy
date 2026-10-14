import { useCallback, useEffect, useRef, useState } from "react";
import zonaCoberturaService, {
  obtenerErrorApi,
} from "../services/zonaCobertura.service";

const MENSAJE_ERROR_LISTAR =
  "No pudimos cargar las zonas de cobertura. Intentá de nuevo.";
const MENSAJE_ERROR_CREAR =
  "No pudimos crear la zona. Revisá los datos e intentá de nuevo.";
const MENSAJE_ERROR_TARIFA =
  "No pudimos actualizar la tarifa. Intentá de nuevo.";
const MENSAJE_ERROR_ESTADO =
  "No pudimos actualizar el estado de la zona. Intentá de nuevo.";

// Estado y acciones de la administración de zonas de cobertura (RF-026).
//   - zonas/loading/error: carga de la lista (error = falló el listado).
//   - errorAccion/procesando: última mutación fallida y mutación en curso.
// Cada acción devuelve { ok, error } (error = { status, codigo, mensaje,
// detalles }) para que el formulario pueda mostrar el detalle en el campo
// correcto; además deja el mensaje en `errorAccion` para errores sin
// formulario (ej. activar/desactivar desde la tabla).
export function useZonasCobertura() {
  const [zonas, setZonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorAccion, setErrorAccion] = useState("");
  const [procesando, setProcesando] = useState(false);

  // Cada pedido de lista lleva un id incremental: si llega una respuesta de
  // un pedido viejo (o el componente ya se desmontó) se descarta, así una
  // respuesta tardía no pisa datos más recientes.
  const pedidoRef = useRef(0);
  // Bloqueo síncrono de mutaciones: `procesando` (estado) no se actualiza
  // entre dos clics del mismo render, el ref sí.
  const procesandoRef = useRef(false);

  const cargarZonas = useCallback(() => {
    const pedido = ++pedidoRef.current;
    const vigente = () => pedido === pedidoRef.current;

    return zonaCoberturaService
      .listarZonas()
      .then((data) => {
        if (!vigente()) return;
        setZonas(Array.isArray(data) ? data : []);
        setError("");
      })
      .catch(() => {
        if (vigente()) setError(MENSAJE_ERROR_LISTAR);
      })
      .finally(() => {
        if (vigente()) setLoading(false);
      });
  }, []);

  // Carga inicial: el estado solo cambia dentro de callbacks de la promesa,
  // nunca de forma síncrona en el efecto (react-hooks/set-state-in-effect).
  useEffect(() => {
    cargarZonas();

    return () => {
      // Invalida cualquier pedido en vuelo al desmontar.
      pedidoRef.current += 1;
    };
  }, [cargarZonas]);

  // Reintento manual desde el estado de error.
  const recargar = useCallback(() => {
    setLoading(true);
    setError("");

    return cargarZonas();
  }, [cargarZonas]);

  const limpiarErrorAccion = useCallback(() => setErrorAccion(""), []);

  // Ejecuta una mutación: ignora clics si ya hay otra en curso y recarga la
  // lista siempre (también si falla) porque la fuente de la verdad es el
  // backend (ej. otra sesión de admin pudo cambiar o desactivar la zona).
  const ejecutarMutacion = useCallback(
    async (accion, mensajePorDefecto) => {
      if (procesandoRef.current) {
        return { ok: false, ignorado: true, error: null };
      }

      procesandoRef.current = true;
      setProcesando(true);
      setErrorAccion("");

      let resultado;

      try {
        await accion();
        resultado = { ok: true, error: null };
      } catch (err) {
        const detalle = obtenerErrorApi(err, mensajePorDefecto);
        setErrorAccion(detalle.mensaje);
        resultado = { ok: false, error: detalle };
      }

      try {
        await cargarZonas();
      } finally {
        procesandoRef.current = false;
        setProcesando(false);
      }

      return resultado;
    },
    [cargarZonas],
  );

  const crear = useCallback(
    (datos) =>
      ejecutarMutacion(
        () => zonaCoberturaService.crearZona(datos),
        MENSAJE_ERROR_CREAR,
      ),
    [ejecutarMutacion],
  );

  const cambiarTarifa = useCallback(
    (id, costo) =>
      ejecutarMutacion(
        () => zonaCoberturaService.cambiarTarifa(id, costo),
        MENSAJE_ERROR_TARIFA,
      ),
    [ejecutarMutacion],
  );

  const cambiarEstado = useCallback(
    (id, estado) =>
      ejecutarMutacion(
        () => zonaCoberturaService.cambiarEstado(id, estado),
        MENSAJE_ERROR_ESTADO,
      ),
    [ejecutarMutacion],
  );

  return {
    zonas,
    loading,
    error,
    errorAccion,
    procesando,
    recargar,
    crear,
    cambiarTarifa,
    cambiarEstado,
    limpiarErrorAccion,
  };
}
