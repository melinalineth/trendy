import { useState } from "react";

import Table from "../common/Table";
import Modal from "../common/Modal";
import Button from "../common/Button";
import Loading from "../common/Loading";
import Alert from "../common/Alert";
import FormularioProducto from "./FormularioProducto";
import UploaderImagenes from "./UploaderImagenes";
import FormularioVariantes from "./FormularioVariantes";
import productoService from "../../services/producto.service";
import { useProductosGestion } from "../../hooks/useProductosGestion";
import "./ProductsPanel.css";

const MENSAJE_ERROR_ACCION =
  "No pudimos actualizar el estado del producto. Intentá de nuevo.";

function formatearPrecio(precio) {
  if (typeof precio !== "number") return precio;
  return `$${precio.toLocaleString("es-CO")}`;
}

// Panel de gestión de productos (RF-013, RF-014, RF-016), reusado tal cual
// en /vendedor/productos y /admin/productos (Products.jsx de cada rol es un
// wrapper de una línea sobre este componente) — mismo patrón que Sellers/
// Users/Roles en el panel de admin de Sprint 1.
//
// El contrato de API no filtra productos por vendedor todavía (no existe un
// GET /productos?vendedorId=...), así que admin y vendedor ven exactamente
// el mismo listado completo por ahora; es una limitación conocida del
// backend de esta ronda, no un bug de esta pantalla.
//
// Composición del formulario: FormularioProducto (nombre/descripción/precio/
// categoría/estado) vive separado de UploaderImagenes y FormularioVariantes
// en vez de anidarlos adentro, porque ambos necesitan un productoId real
// (POST /productos/:id/imagenes y POST /productos/:id/variantes), que no
// existe todavía mientras se está creando el producto. Por eso:
//   - Al crear un producto nuevo, el modal solo muestra FormularioProducto.
//   - Apenas se guarda con éxito (handleGuardado), el modal pasa a "modo
//     edición" del producto recién creado sin cerrarse, mostrando ahí mismo
//     Imágenes y Variantes como secciones hermanas — así se puede seguir
//     cargando todo en un solo flujo, sin obligar a reabrir el modal.
//   - Al editar un producto existente, las tres secciones se ven juntas
//     desde el principio.
function ProductsPanel() {
  const { productos, loading, error, recargar, actualizarEstadoLocal } =
    useProductosGestion();

  const [modalAbierto, setModalAbierto] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [errorAccion, setErrorAccion] = useState("");
  const [actualizandoId, setActualizandoId] = useState(null);

  function abrirCrear() {
    setProductoSeleccionado(null);
    setErrorAccion("");
    setModalAbierto(true);
  }

  function abrirEditar(producto) {
    setProductoSeleccionado(producto);
    setErrorAccion("");
    setModalAbierto(true);
  }

  function cerrarModal() {
    setModalAbierto(false);
    setProductoSeleccionado(null);
  }

  // Tras crear/editar los datos básicos, se recarga la lista completa desde
  // el backend en vez de mezclar el resultado a mano (misma razón que
  // documenta useRoles.actualizarPermisos: la fuente de la verdad es el
  // backend). El modal no se cierra: pasa a mostrar el producto guardado en
  // "modo edición" para poder seguir agregando imágenes/variantes.
  function handleGuardado(productoGuardado) {
    recargar();
    setProductoSeleccionado(productoGuardado);
  }

  async function handleToggleEstado(producto) {
    const nuevoEstado = producto.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";

    setErrorAccion("");
    setActualizandoId(producto.id);

    try {
      await productoService.cambiarEstadoProducto(producto.id, nuevoEstado);
      actualizarEstadoLocal(producto.id, nuevoEstado);
    } catch {
      setErrorAccion(MENSAJE_ERROR_ACCION);
    } finally {
      setActualizandoId(null);
    }
  }

  const columns = [
    { key: "nombre", label: "Nombre" },
    {
      key: "categoria",
      label: "Categoría",
      render: (producto) => producto.categoria?.nombre || "—",
    },
    {
      key: "precio",
      label: "Precio",
      render: (producto) => formatearPrecio(producto.precio),
    },
    { key: "estado", label: "Estado" },
    {
      key: "acciones",
      label: "Acciones",
      render: (producto) => (
        <div className="products-panel__acciones-fila">
          <Button text="Editar" onClick={() => abrirEditar(producto)} />
          <Button
            text={
              actualizandoId === producto.id
                ? "Actualizando..."
                : producto.estado === "ACTIVO"
                  ? "Desactivar"
                  : "Activar"
            }
            onClick={() => handleToggleEstado(producto)}
            disabled={actualizandoId === producto.id}
          />
        </div>
      ),
    },
  ];

  const esEdicion = Boolean(productoSeleccionado?.id);

  return (
    <div className="products-panel">
      <div className="products-panel__header">
        <h1>Productos</h1>
        <Button text="Nuevo producto" onClick={abrirCrear} />
      </div>

      {(error || errorAccion) && (
        <Alert type="error" message={error || errorAccion} />
      )}

      {loading ? (
        <Loading text="Cargando productos..." />
      ) : (
        <Table
          columns={columns}
          rows={productos}
          emptyMessage="No hay productos registrados."
        />
      )}

      <Modal
        isOpen={modalAbierto}
        onClose={cerrarModal}
        title={esEdicion ? `Editar ${productoSeleccionado.nombre}` : "Nuevo producto"}
      >
        <FormularioProducto
          producto={productoSeleccionado}
          onGuardado={handleGuardado}
        />

        {esEdicion && (
          <div className="products-panel__secciones">
            <UploaderImagenes
              productoId={productoSeleccionado.id}
              imagenesIniciales={productoSeleccionado.imagenes ?? []}
            />
            <FormularioVariantes
              productoId={productoSeleccionado.id}
              variantesIniciales={productoSeleccionado.variantes ?? []}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

export default ProductsPanel;
