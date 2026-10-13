import { useCallback, useEffect, useRef, useState } from "react";
import carritoService, {
  CARRITO_ACTUALIZADO_EVENT,
  leerErrorApi,
} from "../services/carrito.service";

const MENSAJE_ERROR_CARGAR =
  "No pudimos cargar tu carrito. Intentá de nuevo más tarde.";
const MENSAJE_ERROR_ACCION =
  "No pudimos actualizar tu carrito. Intentá de nuevo.";
const MENSAJE_ERROR_ENVIO =
  "No pudimos calcular el envío para la dirección elegida.";

// Estados HTTP con los que /carrito/resumen rechaza SOLO el cálculo de envío
// (dirección inválida 400, ajena/inexistente 404, sin zona o tarifa activa
// 409 SIN_COBERTURA): en esos casos el carrito en sí está bien.
const ESTADOS_ERROR_DE_ENVIO = [400, 404, 409];

// El backend devuelve `precio` como Decimal serializado (string) y no
// garantiza el orden de las líneas, así que normalizamos acá una sola vez
// para que los componentes puedan operar con números y un orden estable.
function normalizarCarrito(data) {
  const items = [...(data.items ?? [])]
    .sort((a, b) => a.id - b.id)
    .map((item) => ({
      ...item,
      variante: {
        ...item.variante,
        producto: {
          ...item.variante?.producto,
          precio: Number(item.variante?.producto?.precio ?? 0),
        },
      },
    }));

  return {
    ...data,
    items,
    subtotal: Number(data.subtotal ?? 0),
    costoEnvio: Number(data.costoEnvio ?? 0),
    total: Number(data.total ?? 0),
  };
}

// Pide el resumen del carrito. Si falla SOLO por la dirección (sin
// cobertura, ajena, etc.) no rompemos el carrito: volvemos a pedirlo sin
// dirección (envío 0) y devolvemos el motivo en `errorEnvio` para que la
// página lo muestre junto al resumen.
async function consultarResumen(direccionId) {
  try {
    const data = await carritoService.obtenerResumen(direccionId);

    return { carrito: normalizarCarrito(data), errorEnvio: "" };
  } catch (err) {
    const { status, mensaje } = leerErrorApi(err, MENSAJE_ERROR_ENVIO);

    if (!direccionId || !ESTADOS_ERROR_DE_ENVIO.includes(status)) {
      throw err;
    }

    const data = await carritoService.obtenerResumen();

    return { carrito: normalizarCarrito(data), errorEnvio: mensaje };
  }
}

// Avisa al resto de la app (contador del Header) que el carrito cambió. Si
// ya tenemos el carrito actualizado mandamos la cantidad de líneas para que
// el contador no tenga que volver a pedirlo.
function notificarCambio(carrito) {
  const detail = carrito ? { cantidad: carrito.items.length } : undefined;

  window.dispatchEvent(
    new CustomEvent(CARRITO_ACTUALIZADO_EVENT, { detail }),
  );
}

// Estado y acciones del carrito del cliente (RF-021, RF-022, RF-024).
//  - `direccionId`: si viene, el resumen incluye el costo de envío de esa
//    dirección; cambiarlo recalcula el resumen.
//  - `autoCargar`: false para pantallas que solo necesitan agregar un ítem
//    (detalle de producto) y no deben pedir el carrito completo.
// Cada mutación (agregar/modificar/eliminar) recarga el carrito al terminar,
// también cuando falla (ej. 409 por stock), para que lo que ve la persona
// refleje siempre el estado real del servidor. Mientras una mutación está en
// curso las demás se ignoran (`procesando`), lo que evita el doble clic.
export function useCarrito({ direccionId = null, autoCargar = true } = {}) {
  const [estado, setEstado] = useState(null);
  const [errorAccion, setErrorAccion] = useState("");
  const [procesando, setProcesando] = useState(false);

  // Número de la última solicitud lanzada: una respuesta vieja que llega
  // tarde (cambio rápido de dirección, mutación en medio de una carga) no
  // debe pisar a una más nueva.
  const solicitudRef = useRef(0);
  const procesandoRef = useRef(false);

  // Vuelca en el estado el resultado de una solicitud (null = falló),
  // siempre que siga siendo la más reciente.
  const aplicar = useCallback(
    (solicitud, resultado) => {
      if (solicitud !== solicitudRef.current) return;

      setEstado((previo) =>
        resultado
          ? { direccionId, ...resultado, error: "" }
          : {
              direccionId,
              carrito: previo?.carrito ?? null,
              errorEnvio: previo?.errorEnvio ?? "",
              error: MENSAJE_ERROR_CARGAR,
            },
      );
    },
    [direccionId],
  );

  // `consultarResumen` que nunca rechaza: devuelve null si falló.
  const pedir = useCallback(
    () => consultarResumen(direccionId).catch(() => null),
    [direccionId],
  );

  const recargar = useCallback(async () => {
    solicitudRef.current += 1;
    const solicitud = solicitudRef.current;
    const resultado = await pedir();

    aplicar(solicitud, resultado);

    return resultado?.carrito ?? null;
  }, [aplicar, pedir]);

  // Carga inicial y recarga al cambiar de dirección. El estado solo se
  // actualiza dentro del callback de la promesa (nunca de forma síncrona en
  // el efecto), igual que useDirecciones.
  useEffect(() => {
    if (!autoCargar) return undefined;

    solicitudRef.current += 1;
    const solicitud = solicitudRef.current;

    pedir().then((resultado) => aplicar(solicitud, resultado));

    return () => {
      // Invalida lo que esté en vuelo si el componente se desmonta o cambia
      // la dirección antes de que responda.
      solicitudRef.current += 1;
    };
  }, [autoCargar, pedir, aplicar]);

  const ejecutar = useCallback(
    async (accion) => {
      if (procesandoRef.current) return false;

      procesandoRef.current = true;
      setProcesando(true);
      setErrorAccion("");

      let exito = false;

      try {
        await accion();
        exito = true;
      } catch (err) {
        setErrorAccion(leerErrorApi(err, MENSAJE_ERROR_ACCION).mensaje);
      }

      if (autoCargar) {
        const carrito = await recargar();
        notificarCambio(carrito);
      } else if (exito) {
        notificarCambio(null);
      }

      procesandoRef.current = false;
      setProcesando(false);

      return exito;
    },
    [autoCargar, recargar],
  );

  const agregarItem = useCallback(
    (varianteId, cantidad) =>
      ejecutar(() => carritoService.agregarItem(varianteId, cantidad)),
    [ejecutar],
  );

  const modificarItem = useCallback(
    (itemId, cantidad) =>
      ejecutar(() => carritoService.modificarItem(itemId, cantidad)),
    [ejecutar],
  );

  const eliminarItem = useCallback(
    (itemId) => ejecutar(() => carritoService.eliminarItem(itemId)),
    [ejecutar],
  );

  const limpiarErrorAccion = useCallback(() => setErrorAccion(""), []);

  const carrito = estado?.carrito ?? null;

  return {
    carrito,
    items: carrito?.items ?? [],
    // Subtotal, envío y total ya calculados por el backend (RF-024).
    resumen: {
      subtotal: carrito?.subtotal ?? 0,
      costoEnvio: carrito?.costoEnvio ?? 0,
      total: carrito?.total ?? 0,
    },
    // true hasta que llega la primera respuesta para la dirección actual.
    loading: autoCargar && (estado === null || estado.direccionId !== direccionId),
    // Error al cargar el carrito (no de una acción puntual).
    error: estado?.error ?? "",
    // Motivo por el que no se pudo calcular el envío (ej. sin cobertura).
    errorEnvio: estado?.errorEnvio ?? "",
    // Error de la última acción (ej. 409 STOCK_INSUFICIENTE), listo para
    // mostrarse con <Alert type="error" />.
    errorAccion,
    limpiarErrorAccion,
    procesando,
    agregarItem,
    modificarItem,
    eliminarItem,
    recargar,
  };
}
