import { useEffect, useState } from "react";
import carritoService, {
  CARRITO_ACTUALIZADO_EVENT,
} from "../services/carrito.service";
import { useAuth } from "./useAuth";

// Cantidad de líneas del carrito para el ícono del Header. Solo el rol
// cliente tiene carrito (vendedor/admin reciben 403 y los anónimos 401), por
// eso sin sesión de cliente no pedimos nada y devolvemos 0. Se mantiene al
// día escuchando el evento que disparan useCarrito y sus mutaciones.
export function useCarritoContador() {
  const { usuario, isAuthenticated } = useAuth();
  const esCliente = isAuthenticated && usuario?.rol?.nombre === "cliente";
  const usuarioId = usuario?.id;

  const [cantidad, setCantidad] = useState(0);

  useEffect(() => {
    if (!esCliente) return undefined;

    let activo = true;

    function cargar() {
      carritoService
        .obtenerCarrito()
        .then((data) => {
          if (activo) setCantidad(data.items?.length ?? 0);
        })
        .catch(() => {
          // El contador es decorativo: si falla no molestamos con un error.
        });
    }

    function alActualizar(event) {
      const nueva = event.detail?.cantidad;

      if (typeof nueva === "number") {
        setCantidad(nueva);
      } else {
        cargar();
      }
    }

    cargar();
    window.addEventListener(CARRITO_ACTUALIZADO_EVENT, alActualizar);

    return () => {
      activo = false;
      // Al cambiar de usuario o cerrar sesión no arrastramos la cuenta del
      // anterior, ni siquiera si el próximo fetch falla.
      setCantidad(0);
      window.removeEventListener(CARRITO_ACTUALIZADO_EVENT, alActualizar);
    };
  }, [esCliente, usuarioId]);

  return esCliente ? cantidad : 0;
}
