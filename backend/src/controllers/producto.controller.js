const productoService = require("../services/producto.service");
const {
  crearProductoSchema,
  actualizarProductoSchema,
  cambiarEstadoSchema,
} = require("../dtos/producto.dto");

function formatearErroresZod(error) {
  return error.issues.map((issue) => issue.message).join(", ");
}

// Valida que un query param opcional, si vino, sea un número — evita que un
// valor no numérico llegue como NaN hasta el `gte`/`lte` de Prisma en
// productoRepository.buscar (que no lo valida, confía en que el caller ya
// lo hizo).
function esNumeroValido(valor) {
  if (valor === undefined || valor === "") {
    return true;
  }

  return !Number.isNaN(Number(valor));
}

// RF-008 a RF-011: catálogo público con búsqueda y filtros combinables.
// No requiere auth ni roleGuard — cualquier visitante puede buscar
// productos.
async function listar(req, res) {
  const { categoria, talla, precioMin, precioMax, q } = req.query;

  if (!esNumeroValido(categoria) || !esNumeroValido(precioMin) || !esNumeroValido(precioMax)) {
    return res.status(400).json({
      error: "categoria, precioMin y precioMax deben ser numéricos",
    });
  }

  try {
    const productos = await productoService.buscar({
      categoria,
      talla,
      precioMin,
      precioMax,
      q,
    });
    return res.status(200).json(productos);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al listar los productos" });
  }
}

// RF-012: detalle de producto público (MOD-02). No requiere auth ni
// roleGuard, igual que `listar`.
async function getById(req, res) {
  const { id } = req.params;

  // A diferencia de esNumeroValido (que trata "" / undefined como válido
  // porque son filtros opcionales en `listar`), acá el id es obligatorio:
  // un valor no numérico no puede llegar a Prisma.
  if (Number.isNaN(Number(id))) {
    return res.status(400).json({ error: "id debe ser numérico" });
  }

  try {
    const producto = await productoService.obtenerDetallePorId(id);

    if (!producto) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    return res.status(200).json(producto);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al obtener el producto" });
  }
}

// RF-013: alta de producto. Requiere auth + roleGuard(["admin","vendedor"])
// (ver producto.routes.js). `req.usuario.id` se pasa como candidato a
// vendedorId — hoy el service lo recibe pero no lo persiste, ver la nota
// de limitación conocida en producto.service.crear.
async function crear(req, res) {
  const parseo = crearProductoSchema.safeParse(req.body ?? {});
  if (!parseo.success) {
    return res.status(400).json({ error: formatearErroresZod(parseo.error) });
  }

  try {
    const producto = await productoService.crear(parseo.data, req.usuario?.id);
    return res.status(201).json(producto);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al crear el producto" });
  }
}

// RF-013: edición parcial de producto. Requiere auth + roleGuard.
async function actualizar(req, res) {
  const { id } = req.params;
  if (Number.isNaN(Number(id))) {
    return res.status(400).json({ error: "id debe ser numérico" });
  }

  const parseo = actualizarProductoSchema.safeParse(req.body ?? {});
  if (!parseo.success) {
    return res.status(400).json({ error: formatearErroresZod(parseo.error) });
  }

  try {
    const producto = await productoService.actualizar(id, parseo.data);
    return res.status(200).json(producto);
  } catch (error) {
    if (error instanceof productoService.ProductoNoEncontradoError) {
      return res.status(404).json({ error: error.message });
    }

    console.error(error);
    return res.status(500).json({ error: "Error al actualizar el producto" });
  }
}

// RF-013: cambio de estado (ACTIVO/INACTIVO). Requiere auth + roleGuard.
// 400 cuando se intenta activar sin imágenes (RN validada en el service),
// no 409/422 — es un error de datos de entrada faltantes, mismo criterio
// que el resto de los 400 de este controller.
async function cambiarEstado(req, res) {
  const { id } = req.params;
  if (Number.isNaN(Number(id))) {
    return res.status(400).json({ error: "id debe ser numérico" });
  }

  const parseo = cambiarEstadoSchema.safeParse(req.body ?? {});
  if (!parseo.success) {
    return res.status(400).json({ error: formatearErroresZod(parseo.error) });
  }

  try {
    const producto = await productoService.cambiarEstado(id, parseo.data.estado);
    return res.status(200).json(producto);
  } catch (error) {
    if (error instanceof productoService.ProductoNoEncontradoError) {
      return res.status(404).json({ error: error.message });
    }

    if (error instanceof productoService.ProductoSinImagenError) {
      return res.status(400).json({ error: error.message });
    }

    console.error(error);
    return res.status(500).json({ error: "Error al cambiar el estado del producto" });
  }
}

module.exports = {
  listar,
  getById,
  crear,
  actualizar,
  cambiarEstado,
};
