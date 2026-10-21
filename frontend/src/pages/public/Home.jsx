import { Link, useNavigate } from "react-router-dom";

import ProductCard from "../../components/products/ProductCard";
import Loading from "../../components/common/Loading";
import HeroInicio from "../../components/home/HeroInicio";
import BeneficiosInicio from "../../components/home/BeneficiosInicio";
import CategoriasInicio from "../../components/home/CategoriasInicio";
import {
  IMAGEN_PLACEHOLDER,
  categoriasConProductos,
  formatearPrecio,
  urlImagen,
} from "../../components/home/homeProductos";
import { useProducts } from "../../hooks/useProducts";

import "./Home.css";

const CANTIDAD_PRODUCTOS = 4;
const CANTIDAD_FOTOS_HERO = 3;

// Página de inicio pública (ruta "/"). Con una sola consulta a la lista
// pública de productos (la misma que usa el catálogo) arma tres cosas: el
// collage del banner, las categorías con productos y una muestra del
// catálogo. El banner y los beneficios no dependen de la consulta, así que se
// ven aunque falle o el catálogo esté vacío.
//
// La muestra son los primeros productos que devuelve la API, sin criterio de
// fecha: el modelo Producto no tiene fecha de alta ni la lista tiene un orden
// definido, por eso la sección no se llama «Novedades».
function Home() {
  const navigate = useNavigate();
  const { productos, loading, error } = useProducts();

  const muestra = productos.slice(0, CANTIDAD_PRODUCTOS);
  const categorias = categoriasConProductos(productos);
  const fotosHero = productos
    .map(urlImagen)
    .filter(Boolean)
    .slice(0, CANTIDAD_FOTOS_HERO);

  return (
    <main className="home">
      <div className="home__container">
        <HeroInicio imagenes={fotosHero} />

        <BeneficiosInicio />

        {loading ? (
          <Loading text="Cargando productos..." />
        ) : error ? (
          <p className="home__error" role="alert">
            {error}
          </p>
        ) : (
          <>
            <CategoriasInicio categorias={categorias} />

            <section
              className="home-seccion"
              aria-labelledby="home-muestra-titulo"
            >
              <div className="home-seccion__encabezado">
                <h2 id="home-muestra-titulo" className="home-seccion__titulo">
                  Una muestra del catálogo
                </h2>

                {muestra.length > 0 && (
                  <Link to="/catalogo" className="home-seccion__enlace">
                    Ver todo el catálogo
                  </Link>
                )}
              </div>

              {muestra.length === 0 ? (
                <p className="home-vacio">
                  Todavía no hay productos a la venta. ¡Volvé pronto!
                </p>
              ) : (
                <div className="home__grid">
                  {muestra.map((producto) => (
                    <ProductCard
                      key={producto.id}
                      image={urlImagen(producto) ?? IMAGEN_PLACEHOLDER}
                      name={producto.nombre}
                      category={producto.categoria?.nombre}
                      price={formatearPrecio(producto.precio)}
                      onView={() => navigate(`/productos/${producto.id}`)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

export default Home;
