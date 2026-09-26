import { useEffect, useState } from "react";

import Input from "../common/Input";
import Select from "../common/Select";
import Button from "../common/Button";
import Alert from "../common/Alert";
import productoService from "../../services/producto.service";
import "./FormularioProducto.css";

const ESTADOS = [
  { value: "ACTIVO", label: "Activo" },
  { value: "INACTIVO", label: "Inactivo" },
];

const MENSAJE_ERROR_GUARDAR =
  "No pudimos guardar el producto. Intentá de nuevo.";
const MENSAJE_ERROR_ESTADO =
  "El producto se guardó, pero no pudimos actualizar su estado. Intentá cambiarlo de nuevo desde la tabla.";

// Alta/edición de datos básicos de un producto (RF-013). Composición: este
// formulario SOLO se ocupa de nombre/descripción/precio/categoría/estado —
// imágenes (RF-014) y variantes (RF-016) viven en componentes hermanos
// (UploaderImagenes, FormularioVariantes) que ProductsPanel.jsx muestra al
// lado de este formulario una vez que el producto tiene id. No se anidan
// adentro porque ambos necesitan un productoId que todavía no existe
// mientras se está creando el producto; ver comentario en ProductsPanel.jsx.
//
// El campo "Estado" está deshabilitado en alta: el contrato de
// POST /productos no acepta `estado` en el body (el backend lo asigna en
// ACTIVO por defecto, ver schema.prisma). En edición sí se puede cambiar,
// pero como PUT /productos/:id tampoco acepta `estado`, un cambio de estado
// se envía aparte con PATCH /productos/:id/estado (cambiarEstadoProducto),
// después de que el PUT principal haya tenido éxito.
function FormularioProducto({ producto = null, onGuardado }) {
  const esEdicion = Boolean(producto?.id);

  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? "");
  const [precio, setPrecio] = useState(producto?.precio ?? "");
  const [categoriaId, setCategoriaId] = useState(
    producto?.categoria?.id ? String(producto.categoria.id) : "",
  );
  const [estado, setEstado] = useState(producto?.estado ?? "ACTIVO");

  const [categorias, setCategorias] = useState([]);
  const [errorCategorias, setErrorCategorias] = useState("");
  const [errorFormulario, setErrorFormulario] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let activo = true;

    productoService
      .listarCategorias()
      .then((data) => {
        if (activo) setCategorias(data);
      })
      .catch(() => {
        if (activo) setErrorCategorias("No pudimos cargar las categorías.");
      });

    return () => {
      activo = false;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorFormulario("");

    const precioNumerico = Number(precio);

    if (!nombre.trim()) {
      setErrorFormulario("El nombre es obligatorio.");
      return;
    }

    if (!categoriaId) {
      setErrorFormulario("Elegí una categoría.");
      return;
    }

    if (!Number.isFinite(precioNumerico) || precioNumerico <= 0) {
      setErrorFormulario("El precio debe ser mayor a 0.");
      return;
    }

    const body = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      precio: precioNumerico,
      categoriaId: Number(categoriaId),
    };

    setGuardando(true);

    try {
      const productoGuardado = esEdicion
        ? await productoService.actualizarProducto(producto.id, body)
        : await productoService.crearProducto(body);

      let estadoFinal = productoGuardado.estado;

      if (esEdicion && estado !== producto.estado) {
        try {
          await productoService.cambiarEstadoProducto(producto.id, estado);
          estadoFinal = estado;
        } catch {
          setGuardando(false);
          setErrorFormulario(MENSAJE_ERROR_ESTADO);
          onGuardado({ ...productoGuardado, estado: producto.estado });
          return;
        }
      }

      setGuardando(false);
      onGuardado({ ...productoGuardado, estado: estadoFinal });
    } catch {
      setGuardando(false);
      setErrorFormulario(MENSAJE_ERROR_GUARDAR);
    }
  }

  return (
    <form className="formulario-producto" onSubmit={handleSubmit}>
      {errorFormulario && <Alert type="error" message={errorFormulario} />}
      {errorCategorias && <Alert type="error" message={errorCategorias} />}

      <label className="formulario-producto__campo">
        Nombre
        <Input
          name="nombre"
          placeholder="Nombre del producto"
          value={nombre}
          onChange={(event) => setNombre(event.target.value)}
        />
      </label>

      <label className="formulario-producto__campo">
        Descripción
        <textarea
          className="formulario-producto__textarea"
          name="descripcion"
          placeholder="Descripción del producto"
          value={descripcion}
          onChange={(event) => setDescripcion(event.target.value)}
        />
      </label>

      <label className="formulario-producto__campo">
        Precio
        <Input
          type="number"
          name="precio"
          placeholder="0.00"
          value={precio}
          onChange={(event) => setPrecio(event.target.value)}
        />
      </label>

      <Select
        label="Categoría"
        name="categoria"
        value={categoriaId}
        onChange={(event) => setCategoriaId(event.target.value)}
        options={categorias.map((categoria) => ({
          value: String(categoria.id),
          label: categoria.nombre,
        }))}
        required
      />

      <label className="formulario-producto__campo">
        Estado
        <select
          className="formulario-producto__select"
          name="estado"
          value={estado}
          onChange={(event) => setEstado(event.target.value)}
          disabled={!esEdicion}
        >
          {ESTADOS.map((opcion) => (
            <option key={opcion.value} value={opcion.value}>
              {opcion.label}
            </option>
          ))}
        </select>
        {!esEdicion && (
          <small className="formulario-producto__nota">
            El estado inicial lo asigna el backend (Activo) al crear el
            producto; para cambiarlo, editá el producto después de guardarlo.
          </small>
        )}
      </label>

      {/* No hay botón "Cancelar" acá: este formulario siempre se muestra
          dentro del Modal común (ver ProductsPanel.jsx), que ya trae su
          propio botón de cierre en el footer — duplicarlo confundiría cuál
          de los dos hay que tocar para cancelar. */}
      <div className="formulario-producto__acciones">
        <Button
          type="submit"
          text={guardando ? "Guardando..." : "Guardar"}
          disabled={guardando}
        />
      </div>
    </form>
  );
}

export default FormularioProducto;
