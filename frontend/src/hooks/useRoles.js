import { useCallback, useEffect, useState } from "react";
import rolService from "../services/rol.service";

const MENSAJE_ERROR_LISTAR =
  "No pudimos cargar los roles. Intentá de nuevo más tarde.";
const MENSAJE_ERROR_PERMISOS =
  "No pudimos guardar los permisos. Intentá de nuevo.";

// Maneja el estado de la lista de roles y sus permisos (RF-046).
export function useRoles() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const recargar = useCallback(() => {
    setLoading(true);
    setError("");

    return rolService
      .listarRoles()
      .then((data) => setRoles(data))
      .catch(() => setError(MENSAJE_ERROR_LISTAR))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let activo = true;

    rolService
      .listarRoles()
      .then((data) => {
        if (activo) setRoles(data);
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

  // Tras guardar, recargamos la lista completa en vez de mezclar a mano el
  // array de permisos local: así el estado queda siempre igual a lo que
  // devuelve el backend (fuente de la verdad), igual que `crear` en
  // useDirecciones.
  const actualizarPermisos = useCallback(
    async (id, permisosIds) => {
      try {
        await rolService.actualizarPermisosRol(id, permisosIds);
        await recargar();
        return true;
      } catch {
        setError(MENSAJE_ERROR_PERMISOS);
        return false;
      }
    },
    [recargar],
  );

  return { roles, loading, error, actualizarPermisos, recargar };
}
