import { useCallback, useEffect, useState } from "react";
import direccionService from "../services/direccion.service";

const MENSAJE_ERROR_LISTAR =
  "No pudimos cargar tus direcciones. Intentá de nuevo más tarde.";
const MENSAJE_ERROR_CREAR =
  "No pudimos guardar la dirección. Revisá los datos e intentá de nuevo.";

// Maneja el estado de la lista de direcciones del cliente: carga inicial,
// loading/error y creación con refresco automático de la lista.
export function useDirecciones() {
  const [direcciones, setDirecciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Refresco manual (ej. después de crear una dirección). Se invoca desde
  // manejadores de eventos, no desde un efecto, así que puede setear estado
  // de forma síncrona sin disparar la regla react-hooks/set-state-in-effect.
  const recargar = useCallback(() => {
    setLoading(true);
    setError("");

    return direccionService
      .listarDirecciones()
      .then((data) => setDirecciones(data))
      .catch(() => setError(MENSAJE_ERROR_LISTAR))
      .finally(() => setLoading(false));
  }, []);

  // Carga inicial: el estado solo se actualiza dentro de callbacks de la
  // promesa (then/catch/finally), nunca de forma síncrona en el cuerpo del
  // efecto, evitando cascading renders (react-hooks/set-state-in-effect).
  useEffect(() => {
    let activo = true;

    direccionService
      .listarDirecciones()
      .then((data) => {
        if (activo) setDirecciones(data);
      })
      .catch(() => {
        if (activo) setError(MENSAJE_ERROR_LISTAR);
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    return () => {
      activo = false;
    };
  }, []);

  const crear = useCallback(
    async (datos) => {
      try {
        await direccionService.crearDireccion(datos);
        await recargar();
        return true;
      } catch (err) {
        const mensaje = err.response?.data?.mensaje || MENSAJE_ERROR_CREAR;
        setError(mensaje);
        return false;
      }
    },
    [recargar],
  );

  return { direcciones, loading, error, crear, recargar };
}
