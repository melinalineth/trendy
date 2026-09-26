import { useCallback, useEffect, useState } from "react";
import productoService from "../services/producto.service";

const MENSAJE_ERROR_LISTAR =
  "No pudimos cargar los productos. Intentá de nuevo más tarde.";

// Lista de productos para el panel de gestión de vendedor/admin (RF-013,
// RF-014, RF-016). Es un hook separado de useProducts (catálogo público)
// porque acá no hay filtros de cliente ni paginación, sino recarga completa
// tras cada mutación (alta, edición o cambio de estado).
//
// El contrato de API no filtra productos por vendedor todavía (no existe un
// GET /productos?vendedorId=...), así que tanto el panel de admin como el de
// vendedor ven el mismo listado completo — ver nota en ProductsPanel.jsx.
export function useProductosGestion() {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const recargar = useCallback(() => {
    setLoading(true);
    setError("");

    return productoService
      .listarProductos()
      .then((data) => setProductos(data))
      .catch(() => setError(MENSAJE_ERROR_LISTAR))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let activo = true;

    productoService
      .listarProductos()
      .then((data) => {
        if (activo) setProductos(data);
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

  // Actualización optimista para el toggle rápido de estado en la tabla
  // (igual que actualizarEstadoLocal de useUsuarios): evita recargar todo el
  // listado por un cambio tan chico.
  const actualizarEstadoLocal = useCallback((id, estado) => {
    setProductos((prev) =>
      prev.map((producto) =>
        producto.id === id ? { ...producto, estado } : producto,
      ),
    );
  }, []);

  return { productos, loading, error, recargar, actualizarEstadoLocal };
}
