import { useState } from "react";
import { useNavigate } from "react-router-dom";

import Breadcrumb from "../../components/common/Breadcrumb";
import SearchBar from "../../components/products/SearchBar";
import ProductFilters from "../../components/products/ProductFilters";
import ProductCard from "../../components/products/ProductCard";
import Pagination from "../../components/common/Pagination";
import Loading from "../../components/common/Loading";
import { useProducts } from "../../hooks/useProducts";

import "./Catalogo.css";

const PRODUCTOS_POR_PAGINA = 8;
const IMAGEN_PLACEHOLDER = "/images/placeholder.jpg";

const FILTROS_INICIALES = {
  categoria: "",
  talla: "",
  precioMin: "",
  precioMax: "",
  q: "",
};

// El contrato de /api/v1/productos no define una forma fija para
// `imagenes` (puede llegar como array de strings o de objetos {url}), así
// que la resolvemos de forma defensiva en vez de asumir un shape.
function obtenerImagen(producto) {
  const primera = producto.imagenes?.[0];

  if (!primera) return IMAGEN_PLACEHOLDER;

  return typeof primera === "string" ? primera : primera.url;
}

function formatearPrecio(precio) {
  if (typeof precio !== "number") return precio;

  return precio.toLocaleString("es-CO");
}

// Catálogo público (RF-008 a RF-011): combina búsqueda de texto, filtros
// combinables (categoría, talla, rango de precio) y paginación sobre la
// lista de productos que devuelve el backend.
//
// `filtros` vive acá (no en el hook) porque tanto el SearchBar de arriba
// como el panel de ProductFilters escriben sobre el mismo campo `q`, y
// necesitan quedar sincronizados entre sí.
function Catalog() {
  const navigate = useNavigate();
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [currentPage, setCurrentPage] = useState(1);

  const { productos, loading, error } = useProducts(filtros);

  // Paginación en el cliente: el contrato de /api/v1/productos devuelve el
  // array completo, sin metadata de paginación, así que la recortamos acá.
  // En vez de resetear `currentPage` a 1 con un efecto cuando cambian los
  // filtros (lo que dispara react-hooks/set-state-in-effect por el setState
  // síncrono), la página se "clampea" en el render: si el resultado
  // filtrado tiene menos páginas que la página guardada, mostramos la
  // última válida sin necesidad de un setState extra.
  const totalPaginas = Math.max(
    1,
    Math.ceil(productos.length / PRODUCTOS_POR_PAGINA),
  );
  const paginaActual = Math.min(currentPage, totalPaginas);
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const productosPagina = productos.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);

  const handleSearch = (texto) => {
    setCurrentPage(1);
    setFiltros((prev) => ({ ...prev, q: texto }));
  };

  const handleFiltrosChange = (nuevosFiltros) => {
    setCurrentPage(1);
    setFiltros(nuevosFiltros);
  };

  return (
    <main className="catalogo">
      <div className="catalogo__container">
        <Breadcrumb
          items={[{ label: "Inicio", link: "/" }, { label: "Catálogo" }]}
        />

        <div className="catalogo__header">
          <div>
            <h1 className="catalogo__title">Catálogo de productos</h1>
            <p className="catalogo__subtitle">
              Encontrá las últimas tendencias para vos.
            </p>
          </div>

          <span className="catalogo__count">
            {productos.length} producto{productos.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="catalogo__searchbar">
          <SearchBar onSearch={handleSearch} />
        </div>

        {error && <p className="catalogo__error">{error}</p>}

        <div className="catalogo__content">
          <ProductFilters filtros={filtros} onChange={handleFiltrosChange} />

          <section className="catalogo__products">
            {loading ? (
              <Loading text="Cargando productos..." />
            ) : productosPagina.length === 0 ? (
              <p className="catalogo__vacio">
                No encontramos productos con esos filtros.
              </p>
            ) : (
              <>
                <div className="catalogo__grid">
                  {productosPagina.map((producto) => (
                    <ProductCard
                      key={producto.id}
                      image={obtenerImagen(producto)}
                      name={producto.nombre}
                      category={producto.categoria?.nombre}
                      price={formatearPrecio(producto.precio)}
                      onView={() => navigate(`/productos/${producto.id}`)}
                    />
                  ))}
                </div>

                <Pagination
                  currentPage={paginaActual}
                  totalPages={totalPaginas}
                  onPageChange={setCurrentPage}
                />
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

export default Catalog;
