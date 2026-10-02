const prisma = require("../../prisma/client");
const carritoRepository = require("../repositories/carrito.repository");
const { validarAgregarItem } = require("../dtos/carrito.dto");

class StockInsuficienteError extends Error {
  constructor(message = "Stock insuficiente para la variante seleccionada") {
    super(message);
    this.name = "StockInsuficienteError";
  }
}

/**
 * Agrega una variante al carrito.
 *
 * Flujo:
 * 1. Valida el body mediante el DTO.
 * 2. Busca la variante y verifica que exista.
 * 3. Verifica que el producto esté activo.
 * 4. Verifica que haya stock suficiente.
 * 5. Obtiene o crea el carrito.
 * 6. Si la variante ya está en el carrito, suma la cantidad.
 * 7. Si no existe, crea una nueva línea.
 */
async function agregarItem(usuarioId, body) {
  // 1. Validar DTO antes de consultar/modificar la BD
  const datos = validarAgregarItem(body);

  const varianteId = Number(datos.varianteId);
  const cantidad = Number(datos.cantidad);

  // 2. Validar existencia, estado y stock de la variante
  const variante = await prisma.variante.findUnique({
    where: {
      id: varianteId,
    },
    include: {
      producto: {
        select: {
          id: true,
          estado: true,
        },
      },
    },
  });

  if (!variante) {
    const error = new Error("La variante no existe");
    error.status = 404;
    throw error;
  }

  // El producto debe estar activo para poder vender su variante
  if (variante.producto.estado !== "ACTIVO") {
    const error = new Error("La variante no está disponible para la venta");
    error.status = 409;
    throw error;
  }

  // Validación inicial de stock
  if (cantidad > variante.stock) {
    throw new StockInsuficienteError(
      `Stock insuficiente. Disponible: ${variante.stock}`
    );
  }

  // 3. Obtener o crear el carrito del usuario
  const carrito = await carritoRepository.obtenerOCrear(usuarioId);

  // 4. Buscar si la variante ya está en el carrito
  const itemExistente = carrito.items?.find(
    (item) => Number(item.varianteId) === varianteId
  );

  if (itemExistente) {
    // Si ya existe, se suma la nueva cantidad
    const nuevaCantidad = Number(itemExistente.cantidad) + cantidad;

    // La cantidad total tampoco puede superar el stock
    if (nuevaCantidad > variante.stock) {
      throw new StockInsuficienteError(
        `Stock insuficiente. Disponible: ${variante.stock}. ` +
        `Ya tienes ${itemExistente.cantidad} unidad(es) en el carrito.`
      );
    }

    return carritoRepository.actualizarCantidad(
      itemExistente.id,
      nuevaCantidad
    );
  }

  // 5. No existe la variante en el carrito: crear nueva línea
  return carritoRepository.agregarItem(
    carrito.id,
    varianteId,
    cantidad
  );
}

module.exports = {
  agregarItem,
  StockInsuficienteError,
};