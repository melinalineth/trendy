import { useCallback, useEffect, useRef, useState } from "react";
import direccionService from "../services/direccion.service";
import { obtenerErrorApi } from "../services/apiError";

const MENSAJE_ERROR_LISTAR =
  "No pudimos cargar tus direcciones. Intentá de nuevo más tarde.";
const MENSAJE_ERROR_CREAR =
  "No pudimos guardar la dirección. Revisá los datos e intentá de nuevo.";
const MENSAJE_ERROR_ACTUALIZAR =
  "No pudimos actualizar la dirección. Revisá los datos e intentá de nuevo.";
const MENSAJE_ERROR_PRINCIPAL =
  "No pudimos cambiar la dirección principal. Intentá de nuevo.";
const MENSAJE_ERROR_ELIMINAR =
  "No pudimos eliminar la dirección. Intentá de nuevo.";

// Maneja el estado de la lista de direcciones del cliente (RF-005): carga
// inicial, loading/error y las altas, modificaciones y bajas con refresco
// automático de la lista.
//   - direcciones/loading/error: la carga de la lista (error = falló el listado).
//   - crear / actualizar / marcarPrincipal / eliminar devuelven { ok, error } (error = { status,
//     codigo, mensaje, detalles }) para que la pantalla muestre el motivo donde
//     corresponde; un fallo de la acción NO pisa `error` del listado.
export function useDirecciones() {
  const [direcciones, setDirecciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Cada pedido de lista lleva un id incremental: una respuesta vieja (o de un
  // componente ya desmontado) se descarta y no pisa datos más recientes.
  const pedidoRef = useRef(0);

  const cargar = useCallback(() => {
    const pedido = ++pedidoRef.current;
    const vigente = () => pedido === pedidoRef.current;

    return direccionService
      .listarDirecciones()
      .then((data) => {
        if (!vigente()) return;
        setDirecciones(Array.isArray(data) ? data : []);
        setError("");
      })
      .catch(() => {
        if (vigente()) setError(MENSAJE_ERROR_LISTAR);
      })
      .finally(() => {
        if (vigente()) setLoading(false);
      });
  }, []);

  // Refresco manual desde el estado de error. Se invoca desde manejadores de
  // eventos, no desde un efecto, así que puede setear estado de forma síncrona
  // sin disparar la regla react-hooks/set-state-in-effect.
  const recargar = useCallback(() => {
    setLoading(true);
    setError("");

    return cargar();
  }, [cargar]);

  // Carga inicial: el estado solo se actualiza dentro de callbacks de la
  // promesa (then/catch/finally), nunca de forma síncrona en el cuerpo del
  // efecto, evitando cascading renders (react-hooks/set-state-in-effect).
  useEffect(() => {
    cargar();

    return () => {
      // Invalida cualquier pedido en vuelo al desmontar.
      pedidoRef.current += 1;
    };
  }, [cargar]);

  // Ejecuta una mutación y vuelve a pedir la lista SIN el estado de carga (la
  // pantalla no parpadea): una alta, edición o baja cambia otras filas (la
  // principal) y, si el cliente editó una dirección con pedidos, hasta su id.
  // Ante un 404 la dirección ya no estaba (se borró desde otra pestaña): se
  // refresca igual para que la lista deje de mostrarla.
  const ejecutar = useCallback(
    async (accion, mensajePorDefecto) => {
      try {
        await accion();
      } catch (err) {
        const errorApi = obtenerErrorApi(err, mensajePorDefecto);
        if (errorApi.status === 404) await cargar();
        return { ok: false, error: errorApi };
      }

      await cargar();
      return { ok: true, error: null };
    },
    [cargar],
  );

  const crear = useCallback(
    (datos) =>
      ejecutar(() => direccionService.crearDireccion(datos), MENSAJE_ERROR_CREAR),
    [ejecutar],
  );

  const actualizar = useCallback(
    (id, datos) =>
      ejecutar(
        () => direccionService.actualizarDireccion(id, datos),
        MENSAJE_ERROR_ACTUALIZAR,
      ),
    [ejecutar],
  );

  const marcarPrincipal = useCallback(
    (id) =>
      ejecutar(
        () => direccionService.marcarPrincipal(id),
        MENSAJE_ERROR_PRINCIPAL,
      ),
    [ejecutar],
  );

  const eliminar = useCallback(
    (id) =>
      ejecutar(
        () => direccionService.eliminarDireccion(id),
        MENSAJE_ERROR_ELIMINAR,
      ),
    [ejecutar],
  );

  return {
    direcciones,
    loading,
    error,
    crear,
    actualizar,
    marcarPrincipal,
    eliminar,
    recargar,
  };
}
