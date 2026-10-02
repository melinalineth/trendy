import { useEffect, useState } from "react";
import productoService from "../services/producto.service";

const MENSAJE_ERROR_LISTAR =
  "No pudimos cargar los productos. Intentá de nuevo más tarde.";

// Maneja el estado de la lista de productos del catálogo público (RF-008 a
// RF-011) y vuelve a consultar cada vez que cambian los filtros activos
// (categoría, talla, rango de precio, búsqueda).
//
// `loading` se deriva comparando la clave de los filtros con los que ya
// completaron la última consulta, en vez de resetear el estado con un
// setState síncrono al inicio del efecto (eso dispara
// react-hooks/set-state-in-effect por generar renders en cascada). Con esta
// forma, React ya sabe en el mismo render que "los filtros cambiaron pero el
// resultado todavía no llegó" sin necesidad de un setState extra.
export function useProducts(filtros = {}) {
  const filtrosKey = JSON.stringify(filtros);

  const [resultado, setResultado] = useState({
    filtrosKey: null,
    productos: [],
    error: "",
  });

  useEffect(() => {
    let activo = true;
    const filtrosActuales = JSON.parse(filtrosKey);

    productoService
      .listarProductos(filtrosActuales)
      .then((data) => {
        if (activo) setResultado({ filtrosKey, productos: data, error: "" });
      })
      .catch(() => {
        if (activo) {
          setResultado({ filtrosKey, productos: [], error: MENSAJE_ERROR_LISTAR });
        }
      });

    return () => {
      activo = false;
    };
  }, [filtrosKey]);

  const loading = resultado.filtrosKey !== filtrosKey;

  return { productos: resultado.productos, loading, error: resultado.error };
}
