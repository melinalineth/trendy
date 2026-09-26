import { useCallback, useEffect, useState } from "react";
import inventarioService from "../services/inventario.service";

const MENSAJE_ERROR_LISTAR =
  "No pudimos cargar el inventario. Intentá de nuevo más tarde.";

// Lista de inventario para el panel de admin/vendedor (RF-017). Mismo
// patrón que useProductosGestion: loading/error/data + recarga completa tras
// cada mutación exitosa (acá, cada ajuste de stock), en vez de mezclar el
// resultado a mano — la fuente de la verdad es el backend.
export function useInventario() {
  const [inventario, setInventario] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const recargar = useCallback(() => {
    setLoading(true);
    setError("");

    return inventarioService
      .listarInventario()
      .then((data) => setInventario(data))
      .catch(() => setError(MENSAJE_ERROR_LISTAR))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let activo = true;

    inventarioService
      .listarInventario()
      .then((data) => {
        if (activo) setInventario(data);
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

  return { inventario, loading, error, recargar };
}
