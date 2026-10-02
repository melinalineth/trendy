import { useState } from "react";

import Input from "../common/Input";
import Button from "../common/Button";
import Alert from "../common/Alert";
import productoService from "../../services/producto.service";
import "./UploaderImagenes.css";

// El contrato de /productos/:id/imagenes solo puede llegar como array de
// strings o de objetos { url } (mismo caso defensivo que ya resuelve
// obtenerImagen() en ProductDetail.jsx para el catálogo público).
function resolverUrl(imagen) {
  return typeof imagen === "string" ? imagen : imagen?.url;
}

// LIMITACIÓN CONOCIDA DEL MVP (documentada por el equipo de backend, no es
// una decisión de este componente): todavía no existe upload real de
// archivos. El backend solo expone POST /productos/:id/imagenes con
// { url }, asumiendo que la imagen ya fue subida a algún storage externo
// (bucket, CDN, etc.) por fuera de Trendy. Por eso este componente es un
// input de texto para pegar esa URL + una vista previa, no un selector de
// archivos — cuando el backend soporte upload real, este componente es el
// que hay que reemplazar.
function UploaderImagenes({ productoId, imagenesIniciales = [] }) {
  const [url, setUrl] = useState("");
  const [imagenes, setImagenes] = useState(imagenesIniciales);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [previewValida, setPreviewValida] = useState(true);

  async function handleAgregar(event) {
    event.preventDefault();
    setError("");

    const urlLimpia = url.trim();

    if (!urlLimpia) {
      setError("Pegá la URL de la imagen.");
      return;
    }

    setGuardando(true);

    try {
      const imagen = await productoService.subirImagen(productoId, urlLimpia);
      setImagenes((prev) => [...prev, imagen]);
      setUrl("");
      setPreviewValida(true);
    } catch {
      setError("No pudimos agregar la imagen. Verificá la URL e intentá de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="uploader-imagenes">
      <h3 className="uploader-imagenes__titulo">Imágenes</h3>

      {error && <Alert type="error" message={error} />}

      <div className="uploader-imagenes__lista">
        {imagenes.length === 0 && (
          <p className="uploader-imagenes__vacio">
            Todavía no hay imágenes cargadas.
          </p>
        )}

        {imagenes.map((imagen, index) => (
          <img
            key={imagen.id ?? `${resolverUrl(imagen)}-${index}`}
            src={resolverUrl(imagen)}
            alt={`Imagen ${index + 1} del producto`}
            className="uploader-imagenes__miniatura"
          />
        ))}
      </div>

      <form className="uploader-imagenes__form" onSubmit={handleAgregar}>
        <Input
          name="url-imagen"
          type="text"
          placeholder="https://... (URL de la imagen ya subida)"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setPreviewValida(true);
          }}
        />

        {url.trim() && previewValida && (
          <img
            src={url.trim()}
            alt="Vista previa de la imagen a agregar"
            className="uploader-imagenes__preview"
            onError={() => setPreviewValida(false)}
          />
        )}

        {url.trim() && !previewValida && (
          <p className="uploader-imagenes__preview-error">
            No pudimos previsualizar esa URL. Revisala antes de agregarla.
          </p>
        )}

        <Button
          type="submit"
          text={guardando ? "Agregando..." : "Agregar imagen"}
          disabled={guardando}
        />
      </form>
    </div>
  );
}

export default UploaderImagenes;
