import { useState } from "react";

// Imagen decorativa que no rompe el diseño si una URL falla (las imágenes de
// los productos viven en un storage externo y alguna puede estar rota): prueba
// las URLs de `srcs` en orden y, si ninguna carga, muestra `fallback` (o
// nada). El padre debe pasar `key` ligada a `srcs` para que el estado se
// reinicie cuando cambian.
function ImagenHome({ srcs, className, fallback = null }) {
  const [intento, setIntento] = useState(0);

  const src = srcs[intento];

  if (!src) return fallback;

  return (
    <img
      key={src}
      src={src}
      alt=""
      className={className}
      loading="lazy"
      onError={() => setIntento((actual) => actual + 1)}
    />
  );
}

export default ImagenHome;
