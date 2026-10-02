const imagenService = require("../services/imagen.service");

// RF-014: no hay upload de archivo real en esta ronda — no está instalado
// multer ni ningún SDK de storage (S3, Cloudinary, etc.), y el DDS/ERS de
// esta ronda no lo pide. Decisión de diseño (no scope creep): este
// endpoint asume que el archivo YA fue subido a algún storage externo por
// otra vía (ej: un paso previo en el front, o un servicio de storage
// aparte) y acá solo se recibe y persiste la URL resultante vía
// `{ url }` en el body. Si en una ronda futura se agrega upload real, este
// controller es el punto de entrada a extender.
async function crear(req, res) {
  const { id } = req.params;
  if (Number.isNaN(Number(id))) {
    return res.status(400).json({ error: "id debe ser numérico" });
  }

  const { url } = req.body ?? {};
  if (typeof url !== "string" || url.trim().length === 0) {
    return res.status(400).json({ error: "La url de la imagen es requerida" });
  }

  try {
    const imagen = await imagenService.crear(id, url.trim());
    return res.status(201).json(imagen);
  } catch (error) {
    if (error instanceof imagenService.ProductoNoEncontradoError) {
      return res.status(404).json({ error: error.message });
    }

    if (error instanceof imagenService.ExtensionInvalidaError) {
      return res.status(400).json({ error: error.message });
    }

    console.error(error);
    return res.status(500).json({ error: "Error al crear la imagen" });
  }
}

module.exports = {
  crear,
};
