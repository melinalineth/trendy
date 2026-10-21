import { Link } from "react-router-dom";

import ImagenHome from "./ImagenHome";

// Selectores circulares de categoría. Catalog.jsx no lee filtros de la URL
// (los guarda en estado local), así que todos los accesos llevan a /catalogo
// sin filtro previo; el visitante elige la categoría ahí.
function CategoriasInicio({ categorias }) {
  return (
    <section className="home-seccion" aria-labelledby="home-categorias-titulo">
      <h2 id="home-categorias-titulo" className="home-seccion__titulo">
        Categorías
      </h2>

      {categorias.length === 0 ? (
        <p className="home-vacio">
          Todavía no hay categorías con productos. ¡Volvé pronto!
        </p>
      ) : (
        <ul className="home-categorias">
          {categorias.map((categoria) => (
            <li key={categoria.id}>
              <Link to="/catalogo" className="home-categoria">
                <span className="home-categoria__circulo">
                  <span className="home-categoria__inicial" aria-hidden="true">
                    {categoria.nombre.charAt(0).toUpperCase()}
                  </span>

                  <ImagenHome
                    key={categoria.imagenes.join("|")}
                    srcs={categoria.imagenes}
                    className="home-categoria__imagen"
                  />
                </span>

                <span className="home-categoria__nombre">
                  {categoria.nombre}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default CategoriasInicio;
