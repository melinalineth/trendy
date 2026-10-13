import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import Alert from "../../components/common/Alert";
import Breadcrumb from "../../components/common/Breadcrumb";
import Button from "../../components/common/Button";
import Loading from "../../components/common/Loading";
import Badge from "../../components/common/Badge";
import ImageGallery from "../../components/products/ImageGallery";
import QuantitySelector from "../../components/products/QuantitySelector";
import SelectorTalla from "../../components/products/SelectorTalla";
import { useAuth } from "../../hooks/useAuth";
import { useCarrito } from "../../hooks/useCarrito";
import productoService from "../../services/producto.service";

import "./ProductDetail.css";

const MENSAJE_ERROR =
  "No pudimos cargar este producto. Intentá de nuevo más tarde.";

const RESULTADO_INICIAL = {
  id: null,
  producto: null,
  error: "",
  notFound: false,
};

// El contrato de /api/v1/productos/:id devuelve `imagenes` como objetos
// {id, url, orden}; las ordenamos acá porque el backend no garantiza el
// orden de llegada del array.
function obtenerImagenesOrdenadas(producto) {
  const imagenes = producto?.imagenes ?? [];

  return [...imagenes]
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map((imagen) => imagen.url);
}

function formatearPrecio(precio) {
  if (typeof precio !== "number") return precio;

  return precio.toLocaleString("es-CO");
}

// Detalle de producto público (RF-012): trae el producto por el id de la
// URL y muestra imágenes, datos y el selector de talla/color. Distinguimos
// el 404 (producto inexistente o inactivo, según el contrato) de un error
// genérico de red/servidor para no mostrar una pantalla rota cuando el id
// simplemente no corresponde a ningún producto.
// El id de la variante seleccionada arranca en null y se resetea dentro de
// los callbacks del fetch (no de forma síncrona en el cuerpo del efecto)
// para no disparar renders en cascada (react-hooks/set-state-in-effect),
// siguiendo el mismo patrón que useProducts.
function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { usuario, isAuthenticated } = useAuth();

  const [resultado, setResultado] = useState(RESULTADO_INICIAL);
  const [varianteSeleccionada, setVarianteSeleccionada] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [agregado, setAgregado] = useState(false);

  // Acá solo se agrega (RF-021): no hace falta pedir el carrito completo.
  const { agregarItem, errorAccion, limpiarErrorAccion, procesando } =
    useCarrito({ autoCargar: false });

  useEffect(() => {
    let activo = true;

    productoService
      .obtenerProducto(id)
      .then((data) => {
        if (!activo) return;

        setVarianteSeleccionada(null);
        setCantidad(1);
        setAgregado(false);
        setResultado({ id, producto: data, error: "", notFound: false });
      })
      .catch((err) => {
        if (!activo) return;

        const esNotFound = err.response?.status === 404;

        setVarianteSeleccionada(null);
        setCantidad(1);
        setAgregado(false);
        setResultado({
          id,
          producto: null,
          error: esNotFound ? "" : MENSAJE_ERROR,
          notFound: esNotFound,
        });
      });

    return () => {
      activo = false;
    };
  }, [id]);

  const loading = resultado.id !== id;

  // Elegir otra variante reinicia la cantidad (el stock máximo cambia) y
  // limpia el resultado del último intento de agregar.
  function seleccionarVariante(variante) {
    setVarianteSeleccionada(variante);
    setCantidad(1);
    setAgregado(false);
    limpiarErrorAccion();
  }

  async function handleAgregarAlCarrito() {
    // Sin sesión no hay carrito: se manda a iniciar sesión.
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    setAgregado(false);

    const exito = await agregarItem(varianteSeleccionada.id, cantidad);

    setAgregado(exito);
  }

  if (loading) {
    return (
      <main className="detalle-producto">
        <div className="detalle-producto__container">
          <Loading text="Cargando producto..." />
        </div>
      </main>
    );
  }

  if (resultado.notFound) {
    return (
      <main className="detalle-producto">
        <div className="detalle-producto__container">
          <p className="detalle-producto__no-encontrado">
            No encontramos este producto. Puede que ya no esté disponible.
          </p>
        </div>
      </main>
    );
  }

  if (resultado.error) {
    return (
      <main className="detalle-producto">
        <div className="detalle-producto__container">
          <p className="detalle-producto__error">{resultado.error}</p>
        </div>
      </main>
    );
  }

  const producto = resultado.producto;
  const variantes = producto.variantes ?? [];
  const agotado =
    variantes.length > 0 && variantes.every((variante) => !variante.disponible);

  // Vendedor y admin no tienen carrito: no se les ofrece agregar.
  const puedeComprar = !isAuthenticated || usuario?.rol?.nombre === "cliente";
  const sinStock = !varianteSeleccionada || varianteSeleccionada.stock <= 0;

  return (
    <main className="detalle-producto">
      <div className="detalle-producto__container">
        <Breadcrumb
          items={[
            { label: "Inicio", link: "/" },
            { label: "Catálogo", link: "/catalogo" },
            { label: producto.nombre },
          ]}
        />

        <div className="detalle-producto__contenido">
          <div className="detalle-producto__galeria">
            <ImageGallery images={obtenerImagenesOrdenadas(producto)} />
          </div>

          <div className="detalle-producto__info">
            {producto.categoria?.nombre && (
              <span className="detalle-producto__categoria">
                {producto.categoria.nombre}
              </span>
            )}

            <h1 className="detalle-producto__nombre">{producto.nombre}</h1>

            <p className="detalle-producto__precio">
              ${formatearPrecio(producto.precio)}
            </p>

            {agotado && (
              <div className="detalle-producto__badge">
                <Badge text="Agotado" type="sale" />
              </div>
            )}

            {producto.descripcion && (
              <p className="detalle-producto__descripcion">
                {producto.descripcion}
              </p>
            )}

            <SelectorTalla
              key={id}
              variantes={variantes}
              onSelect={seleccionarVariante}
            />

            {varianteSeleccionada && (
              <p className="detalle-producto__stock">
                Stock disponible: {varianteSeleccionada.stock}
              </p>
            )}

            {puedeComprar && (
              <div className="detalle-producto__compra">
                {varianteSeleccionada && !sinStock && (
                  <div className="detalle-producto__cantidad">
                    <span className="detalle-producto__cantidad-label">
                      Cantidad
                    </span>
                    <QuantitySelector
                      quantity={cantidad}
                      min={1}
                      max={varianteSeleccionada.stock}
                      disabled={procesando}
                      label={producto.nombre}
                      onChange={setCantidad}
                    />
                  </div>
                )}

                <Button
                  text={procesando ? "Agregando..." : "Agregar al carrito"}
                  onClick={handleAgregarAlCarrito}
                  disabled={sinStock || procesando}
                />

                {!varianteSeleccionada && (
                  <p className="detalle-producto__ayuda">
                    Elegí una talla y color para agregar al carrito.
                  </p>
                )}

                <div aria-live="polite">
                  {errorAccion && (
                    <Alert
                      type="error"
                      message={errorAccion}
                      onClose={limpiarErrorAccion}
                    />
                  )}
                  {agregado && !errorAccion && (
                    <Alert
                      type="success"
                      message={
                        <>
                          Agregaste el producto a tu carrito.{" "}
                          <Link to="/carrito">Ver carrito</Link>
                        </>
                      }
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default ProductDetail;
