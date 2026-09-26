import { useEffect, useState } from "react";
import productoService from "../../services/producto.service";
import "./ProductFilters.css";

// Tallas comunes de indumentaria (RF-009). Se deja como lista fija en vez de
// pedirlas al backend porque no varían por catálogo.
const TALLAS = ["XS", "S", "M", "L", "XL"];

// Se usa solo para el botón "Limpiar filtros". El valor inicial "real" que
// ve la página vive en Catalog.jsx (dueño del estado) — no se exporta desde
// acá para no mezclar un export de componente con uno de datos en el mismo
// archivo (rompe react-refresh/only-export-components).
const FILTROS_VACIOS = {
  categoria: "",
  talla: "",
  precioMin: "",
  precioMax: "",
  q: "",
};

// Filtros combinables del catálogo público: categoría, talla, rango de
// precio y búsqueda de texto (RF-008 a RF-011). Es un componente controlado:
// el padre (Catalog.jsx) es dueño del estado de `filtros` y recibe cada
// cambio a través de `onChange`, así puede combinarlo con el estado que
// viene del SearchBar de la parte superior sin que se pisen entre sí.
function ProductFilters({ filtros, onChange }) {
  const [categorias, setCategorias] = useState([]);
  const [errorCategorias, setErrorCategorias] = useState("");

  useEffect(() => {
    let activo = true;

    productoService
      .listarCategorias()
      .then((data) => {
        if (activo) setCategorias(data);
      })
      .catch(() => {
        if (activo) {
          setErrorCategorias("No pudimos cargar las categorías.");
        }
      });

    return () => {
      activo = false;
    };
  }, []);

  const actualizarCampo = (campo, valor) => {
    onChange({ ...filtros, [campo]: valor });
  };

  const limpiarFiltros = () => {
    onChange({ ...FILTROS_VACIOS });
  };

  return (
    <aside className="product-filters">
      <div className="product-filters__header">
        <h2 className="product-filters__title">Filtros</h2>

        <button
          type="button"
          className="product-filters__clear"
          onClick={limpiarFiltros}
        >
          Limpiar filtros
        </button>
      </div>

      <div className="product-filters__field">
        <label className="product-filters__label" htmlFor="filtro-q">
          Buscar
        </label>
        <input
          id="filtro-q"
          type="text"
          className="product-filters__input"
          placeholder="Nombre del producto..."
          value={filtros.q}
          onChange={(e) => actualizarCampo("q", e.target.value)}
        />
      </div>

      <div className="product-filters__field">
        <label className="product-filters__label" htmlFor="filtro-categoria">
          Categoría
        </label>
        <select
          id="filtro-categoria"
          className="product-filters__select"
          value={filtros.categoria}
          onChange={(e) => actualizarCampo("categoria", e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
            </option>
          ))}
        </select>
        {errorCategorias && (
          <span className="product-filters__error">{errorCategorias}</span>
        )}
      </div>

      <div className="product-filters__field">
        <label className="product-filters__label" htmlFor="filtro-talla">
          Talla
        </label>
        <select
          id="filtro-talla"
          className="product-filters__select"
          value={filtros.talla}
          onChange={(e) => actualizarCampo("talla", e.target.value)}
        >
          <option value="">Todas las tallas</option>
          {TALLAS.map((talla) => (
            <option key={talla} value={talla}>
              {talla}
            </option>
          ))}
        </select>
      </div>

      <div className="product-filters__field">
        <span className="product-filters__label">Precio</span>
        <div className="product-filters__rango">
          <input
            type="number"
            min="0"
            inputMode="numeric"
            className="product-filters__precio-input"
            placeholder="Mín."
            aria-label="Precio mínimo"
            value={filtros.precioMin}
            onChange={(e) => actualizarCampo("precioMin", e.target.value)}
          />
          <span className="product-filters__rango-separador">–</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            className="product-filters__precio-input"
            placeholder="Máx."
            aria-label="Precio máximo"
            value={filtros.precioMax}
            onChange={(e) => actualizarCampo("precioMax", e.target.value)}
          />
        </div>
      </div>
    </aside>
  );
}

export default ProductFilters;
