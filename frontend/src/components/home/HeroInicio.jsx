import { Link } from "react-router-dom";

import ImagenHome from "./ImagenHome";

// Banner principal del inicio. El fondo es un degradé de tokens (sin imagen
// externa); el collage de fotos es opcional: son hasta 3 imágenes reales de
// productos y solo se muestra en pantallas anchas.
//
// El título es el <h1> de la página, igual que en el resto de las pantallas
// del proyecto (cada una declara el suyo). El <h1> «Trendy» del Header global
// queda como marca del sitio.
function HeroInicio({ imagenes }) {
  return (
    <section className="home-hero" aria-labelledby="home-hero-titulo">
      <div className="home-hero__texto">
        <p className="home-hero__eyebrow">Nueva colección</p>

        <h1 id="home-hero-titulo" className="home-hero__titulo">
          Descubrí tu estilo
        </h1>

        <p className="home-hero__descripcion">
          Elegí tus prendas favoritas, armá tu carrito y pedilas desde donde
          estés.
        </p>

        <Link to="/catalogo" className="home-hero__cta">
          Comprar ahora
        </Link>
      </div>

      {imagenes.length > 0 && (
        <div className="home-hero__collage" aria-hidden="true">
          {imagenes.map((src) => (
            <div key={src} className="home-hero__foto">
              <ImagenHome srcs={[src]} className="home-hero__imagen" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default HeroInicio;
