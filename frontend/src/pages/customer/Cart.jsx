import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Alert from "../../components/common/Alert";
import Button from "../../components/common/Button";
import Loading from "../../components/common/Loading";
import Select from "../../components/common/Select";
import QuantitySelector from "../../components/products/QuantitySelector";
import { useCarrito } from "../../hooks/useCarrito";
import { useDirecciones } from "../../hooks/useDirecciones";
import "./Cart.css";

function formatearPrecio(valor) {
  return `$${Number(valor).toLocaleString("es-CO")}`;
}

function describirDireccion(direccion) {
  return `${direccion.destinatario} — ${direccion.calle}, ${direccion.ciudad}`;
}

// Carrito del cliente (RF-021, RF-022, RF-024): líneas con cantidad
// editable y eliminación, selector de dirección para calcular el envío y
// resumen con subtotal, envío y total calculados por el backend.
function Cart() {
  const navigate = useNavigate();
  const {
    direcciones,
    loading: cargandoDirecciones,
    error: errorDirecciones,
  } = useDirecciones();

  // null = la persona todavía no eligió: se usa la dirección principal (si
  // tiene) para que el envío aparezca calculado sin pasos extra.
  const [direccionElegida, setDireccionElegida] = useState(null);
  const direccionPrincipal = direcciones.find((d) => d.esPrincipal);
  const direccionId = direccionElegida ?? direccionPrincipal?.id ?? null;

  const {
    carrito,
    items,
    resumen,
    loading,
    error,
    errorEnvio,
    errorAccion,
    limpiarErrorAccion,
    procesando,
    modificarItem,
    eliminarItem,
    recargar,
  } = useCarrito({ direccionId });

  // Solo bloqueamos la pantalla en la primera carga; al cambiar de dirección
  // mantenemos las líneas visibles y solo marcamos el envío como "calculando".
  const primeraCarga = loading && !carrito;
  const calculandoEnvio = loading && Boolean(carrito);

  function cambiarCantidad(item, nueva) {
    const stock = item.variante.stock;
    // Si el stock bajó por debajo de lo que hay en el carrito, el primer
    // "−" ajusta directo al máximo disponible en vez de seguir pidiendo una
    // cantidad que el backend rechazaría con 409.
    const destino = stock >= 1 ? Math.min(nueva, stock) : nueva;

    modificarItem(item.id, destino);
  }

  if (primeraCarga) {
    return (
      <div className="cart-page">
        <Loading text="Cargando tu carrito..." />
      </div>
    );
  }

  if (!carrito) {
    return (
      <div className="cart-page">
        <h1 className="cart-page__titulo">Mi carrito</h1>
        <div aria-live="polite">
          {error && <Alert type="error" message={error} />}
        </div>
        <Button text="Reintentar" onClick={recargar} />
      </div>
    );
  }

  const opcionesDireccion = direcciones.map((direccion) => ({
    value: String(direccion.id),
    label: describirDireccion(direccion),
  }));

  const envioCalculado = Boolean(direccionId) && !errorEnvio;
  const hayLineasSinStock = items.some(
    (item) => item.cantidad > item.variante.stock,
  );
  const puedeContinuar =
    items.length > 0 &&
    envioCalculado &&
    !calculandoEnvio &&
    !hayLineasSinStock &&
    !procesando;

  let textoEnvio = "Sin calcular";
  if (calculandoEnvio) {
    textoEnvio = "Calculando...";
  } else if (envioCalculado) {
    textoEnvio = formatearPrecio(resumen.costoEnvio);
  }

  return (
    <div className="cart-page">
      <h1 className="cart-page__titulo">
        Mi carrito{items.length > 0 ? ` (${items.length})` : ""}
      </h1>

      <div className="cart-page__avisos" aria-live="polite">
        {errorAccion && (
          <Alert type="error" message={errorAccion} onClose={limpiarErrorAccion} />
        )}
        {error && <Alert type="error" message={error} />}
      </div>

      {items.length === 0 ? (
        <section className="cart-vacio">
          <p className="cart-vacio__titulo">Tu carrito está vacío</p>
          <p className="cart-vacio__texto">
            Explorá el catálogo y agregá los productos que te gusten.
          </p>
          <Link to="/catalogo" className="cart-link cart-link--boton">
            Ver catálogo
          </Link>
        </section>
      ) : (
        <div className="cart-layout">
          <ul className="cart-lista" aria-label="Productos en tu carrito">
            {items.map((item) => {
              const { variante } = item;
              const { producto } = variante;
              const stock = variante.stock;
              const excedeStock = item.cantidad > stock;

              return (
                <li key={item.id} className="cart-item">
                  <div className="cart-item__info">
                    <Link
                      to={`/productos/${producto.id}`}
                      className="cart-item__nombre"
                    >
                      {producto.nombre}
                    </Link>
                    <p className="cart-item__variante">
                      Talla {variante.talla}
                      {variante.color ? ` · ${variante.color}` : ""}
                    </p>
                    <p className="cart-item__precio">
                      {formatearPrecio(producto.precio)} c/u
                    </p>
                    {excedeStock && (
                      <p className="cart-item__aviso">
                        {stock > 0
                          ? `Solo quedan ${stock} unidades disponibles. Ajustá la cantidad.`
                          : "Este producto se quedó sin stock. Eliminalo para continuar."}
                      </p>
                    )}
                  </div>

                  <div className="cart-item__acciones">
                    <QuantitySelector
                      quantity={item.cantidad}
                      min={1}
                      max={stock}
                      // Sin stock el backend rechazaría cualquier cantidad
                      // (409): solo queda "Eliminar".
                      disabled={procesando || stock <= 0}
                      label={producto.nombre}
                      onChange={(nueva) => cambiarCantidad(item, nueva)}
                    />

                    <p className="cart-item__total">
                      {formatearPrecio(producto.precio * item.cantidad)}
                    </p>

                    <button
                      type="button"
                      className="cart-item__eliminar"
                      onClick={() => eliminarItem(item.id)}
                      disabled={procesando}
                      aria-label={`Eliminar ${producto.nombre} del carrito`}
                    >
                      Eliminar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <aside className="cart-resumen" aria-label="Resumen de compra">
            <h2 className="cart-resumen__titulo">Resumen de compra</h2>

            <div className="cart-resumen__direccion">
              {cargandoDirecciones ? (
                <p className="cart-resumen__nota">Cargando direcciones...</p>
              ) : errorDirecciones ? (
                <Alert type="error" message={errorDirecciones} />
              ) : direcciones.length === 0 ? (
                <p className="cart-resumen__nota">
                  Para calcular el envío necesitás una dirección.{" "}
                  <Link to="/direcciones" className="cart-link">
                    Agregar dirección
                  </Link>
                </p>
              ) : (
                <Select
                  label="Dirección de envío"
                  name="direccionEnvio"
                  value={direccionId ? String(direccionId) : ""}
                  onChange={(event) =>
                    setDireccionElegida(Number(event.target.value))
                  }
                  options={opcionesDireccion}
                  placeholder="Elegí una dirección"
                  disabled={procesando}
                />
              )}
            </div>

            <div aria-live="polite">
              {errorEnvio && <Alert type="warning" message={errorEnvio} />}
            </div>

            <dl className="cart-resumen__filas">
              <div className="cart-resumen__fila">
                <dt>Subtotal</dt>
                <dd>{formatearPrecio(resumen.subtotal)}</dd>
              </div>
              <div className="cart-resumen__fila">
                <dt>Envío</dt>
                <dd>{textoEnvio}</dd>
              </div>
              <div className="cart-resumen__fila cart-resumen__fila--total">
                <dt>Total</dt>
                <dd>{formatearPrecio(resumen.total)}</dd>
              </div>
            </dl>

            {!envioCalculado && !calculandoEnvio && (
              <p className="cart-resumen__nota">
                {direccionId
                  ? "El total todavía no incluye el envío."
                  : "Elegí una dirección para sumar el costo de envío."}
              </p>
            )}

            {/* Checkout (RF-030): solo con el envío calculado (dirección con
                cobertura) y sin líneas que superen el stock; la dirección
                elegida viaja al checkout para no tener que repetirla. */}
            <Button
              text="Continuar compra"
              onClick={() =>
                navigate("/checkout", { state: { direccionId } })
              }
              disabled={!puedeContinuar}
            />
            {!puedeContinuar && !calculandoEnvio && (
              <p className="cart-resumen__nota">
                {hayLineasSinStock
                  ? "Ajustá las cantidades sin stock para continuar."
                  : "Elegí una dirección con cobertura para continuar."}
              </p>
            )}

            <Link to="/catalogo" className="cart-link">
              Seguir comprando
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}

export default Cart;
