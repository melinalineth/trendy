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

/**
 * Modifica la cantidad de un item del carrito.
 *
 * La nueva cantidad no puede superar el stock disponible
 * de la variante.
 */
async function modificarItem(usuarioId, itemId, cantidad) {
  const nuevaCantidad = Number(cantidad);

  if (!Number.isInteger(nuevaCantidad) || nuevaCantidad <= 0) {
    const error = new Error(
      "La cantidad debe ser un entero mayor que cero"
    );
    error.status = 400;
    throw error;
  }

  // Obtener el carrito del usuario
  const carrito = await carritoRepository.obtenerOCrear(usuarioId);

  // Verificar que el item pertenezca al carrito del usuario
  const item = carrito.items?.find(
    (itemCarrito) => Number(itemCarrito.id) === Number(itemId)
  );

  if (!item) {
    const error = new Error(
      "El item no pertenece al carrito del usuario"
    );
    error.status = 404;
    throw error;
  }

  // Consultar la variante para obtener el stock actual
  const variante = await prisma.variante.findUnique({
    where: {
      id: Number(item.varianteId),
    },
  });

  if (!variante) {
    const error = new Error("La variante no existe");
    error.status = 404;
    throw error;
  }

  // Validar stock disponible
  if (nuevaCantidad > variante.stock) {
    throw new StockInsuficienteError(
      `Stock insuficiente. Disponible: ${variante.stock}`
    );
  }

  // Actualizar mediante el repository
  await carritoRepository.actualizarCantidad(
    itemId,
    nuevaCantidad
  );

  // Devolver el resumen actualizado
  return resumen(usuarioId);
}


/**
 * Elimina un item del carrito.
 */
async function eliminarItem(usuarioId, itemId) {
  // Obtener el carrito del usuario
  const carrito = await carritoRepository.obtenerOCrear(usuarioId);

  // Verificar que el item pertenezca al carrito
  const item = carrito.items?.find(
    (itemCarrito) => Number(itemCarrito.id) === Number(itemId)
  );

  if (!item) {
    const error = new Error(
      "El item no pertenece al carrito del usuario"
    );
    error.status = 404;
    throw error;
  }

  // Eliminar mediante el repository
  await carritoRepository.eliminarItem(itemId);

  // Obtener nuevamente el carrito
  const carritoActualizado =
    await carritoRepository.obtenerConItems(carrito.id);

  const items = carritoActualizado?.items || [];

  // Si quedó vacío, informarlo explícitamente
  if (items.length === 0) {
    return {
      carritoId: carrito.id,
      items: [],
      subtotal: 0,
      costoEnvio: 0,
      total: 0,
      vacio: true,
      mensaje: "El carrito ha quedado vacío",
    };
  }

  return resumen(usuarioId);
}


/**
 * Calcula el resumen del carrito.
 *
 * subtotal = precio * cantidad de cada item
 * costoEnvio = costo calculado según la dirección
 * total = subtotal + costoEnvio
 */
async function resumen(usuarioId, direccionId = null) {
  // Obtener el carrito del usuario
  const carrito = await carritoRepository.obtenerOCrear(usuarioId);

  // Obtener items con variante y producto
  const carritoCompleto =
    await carritoRepository.obtenerConItems(carrito.id);

  const items = carritoCompleto?.items || [];

  // Calcular subtotal
  const subtotal = items.reduce((acumulado, item) => {
    const precio = Number(
      item.variante?.producto?.precio || 0
    );

    const cantidad = Number(item.cantidad || 0);

    return acumulado + precio * cantidad;
  }, 0);

  // Por defecto no hay costo de envío
  let costoEnvio = 0;

  // Si se proporciona dirección, calcular envío
  if (direccionId) {
    const resultadoEnvio =
      await envioService.calcularCosto(
        direccionId,
        usuarioId
      );

    costoEnvio = Number(resultadoEnvio.costo || 0);
  }

  // Calcular total
  const total = subtotal + costoEnvio;

  return {
    carritoId: carrito.id,
    items,
    subtotal,
    costoEnvio,
    total,
    vacio: items.length === 0,
  };
}

module.exports = {
  agregarItem,
  StockInsuficienteError,
};