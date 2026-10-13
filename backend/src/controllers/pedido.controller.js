
const pedidoService = require("../services/pedido.service");

function obtenerRol(usuario) {
  return String(usuario?.rol || usuario?.role || "").toLowerCase();
}

function esPersonalAutorizado(usuario) {
  const rol = obtenerRol(usuario);
  return rol === "admin" || rol === "administrador" || rol === "vendedor";
}

/**
 * POST /api/v1/pedidos
 * Crea un pedido para el cliente autenticado.
 */
async function crear(req, res) {
  try {
    const usuarioId = req.usuario.id;

    const pedido = await pedidoService.crearPedido(
      usuarioId,
      req.body
    );

    return res.status(201).json({
      mensaje: "Pedido creado correctamente",
      pedido,
    });
  } catch (error) {
    if (error instanceof pedidoService.StockInsuficienteError) {
      return res.status(409).json({ error: error.message });
    }

    if (error instanceof pedidoService.CoberturaNoDisponibleError) {
      return res.status(409).json({ error: error.message });
    }

    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error("Error al crear pedido:", error);
    return res.status(500).json({
      error: "Error interno al crear el pedido",
    });
  }
}

/**
 * GET /api/v1/pedidos
 * Cliente: solo sus pedidos.
 * Admin/vendedor: consulta general con filtros.
 */
async function listar(req, res) {
  try {
    const usuario = req.usuario;
    const filtros = {
      estado: req.query.estado,
      numero: req.query.numero,
    };

    if (esPersonalAutorizado(usuario)) {
      if (req.query.usuarioId !== undefined) {
        const usuarioId = Number(req.query.usuarioId);

        if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
          return res.status(400).json({
            error: "El usuarioId debe ser un entero positivo",
          });
        }

        filtros.usuarioId = usuarioId;
      }

      const pedidos = await pedidoService.listarPedidos(filtros);
      return res.status(200).json(pedidos);
    }

    // No aceptar usuarioId enviado por un cliente:
    // el filtro siempre sale de la sesión autenticada.
    const pedidos = await pedidoService.listarPedidos({
      ...filtros,
      usuarioId: usuario.id,
    });

    return res.status(200).json(pedidos);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error("Error al listar pedidos:", error);
    return res.status(500).json({
      error: "Error interno al consultar los pedidos",
    });
  }
}

/**
 * GET /api/v1/pedidos/:id
 * Impide que un cliente consulte pedidos ajenos.
 */
async function obtenerPorId(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "El id del pedido no es válido",
      });
    }

    const pedido = await pedidoService.obtenerPedidoPorId(id);

    if (!pedido) {
      return res.status(404).json({
        error: "Pedido no encontrado",
      });
    }

    const usuario = req.usuario;

    if (
      !esPersonalAutorizado(usuario) &&
      Number(pedido.usuarioId) !== Number(usuario.id)
    ) {
      return res.status(404).json({
        error: "Pedido no encontrado",
      });
    }

    return res.status(200).json(pedido);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error("Error al consultar pedido:", error);
    return res.status(500).json({
      error: "Error interno al consultar el pedido",
    });
  }
}

/**
 * PATCH /api/v1/pedidos/:id/estado
 * Solo admin/vendedor, protegido también por roleGuard en las rutas.
 */
async function actualizarEstado(req, res) {
  try {
    const id = Number(req.params.id);
    const { estado } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "El id del pedido no es válido",
      });
    }

    if (!estado || typeof estado !== "string") {
      return res.status(400).json({
        error: "El estado es obligatorio",
      });
    }

    const pedido = await pedidoService.actualizarEstado(
      id,
      estado,
      req.usuario.id
    );

    return res.status(200).json({
      mensaje: "Estado del pedido actualizado correctamente",
      pedido,
    });
  } catch (error) {
    if (error instanceof pedidoService.TransicionEstadoInvalidaError) {
      return res.status(409).json({ error: error.message });
    }

    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error("Error al actualizar estado:", error);
    return res.status(500).json({
      error: "Error interno al actualizar el estado del pedido",
    });
  }
}

module.exports = {
  crear,
  listar,
  obtenerPorId,
  actualizarEstado,
};
