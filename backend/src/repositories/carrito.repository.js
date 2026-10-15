const prisma = require("../config/prisma");

const carritoRepository = {
  /**
   * Devuelve el carrito del usuario CON sus items; si todavía no tiene, lo
   * crea (con items vacío). Carrito.usuarioId es @unique, por eso se puede
   * buscar con findUnique.
   *
   * Los items son necesarios: carrito.service.agregarItem hace
   * `carrito.items.find(...)` para sumar a la línea existente y validar que
   * el TOTAL no supere el stock. Sin el include, `items` era undefined, esa
   * rama nunca corría y se podía superar el stock agregando varias veces
   * (RF-018).
   */
  async obtenerOCrear(usuarioId) {
    const id = Number(usuarioId);

    let carrito = await prisma.carrito.findUnique({
      where: {
        usuarioId: id,
      },
      include: {
        items: true,
      },
    });

    if (!carrito) {
      carrito = await prisma.carrito.create({
        data: {
          usuarioId: id,
        },
        include: {
          items: true,
        },
      });
    }

    return carrito;
  },

  /**
   * Agrega una variante al carrito. ItemCarrito tiene
   * @@unique([carritoId, varianteId]), así que si la variante ya estaba en el
   * carrito se suma la cantidad en vez de intentar crear un duplicado (que
   * fallaría por la restricción de unicidad).
   */
  async agregarItem(carritoId, varianteId, cantidad) {
    const idCarrito = Number(carritoId);
    const idVariante = Number(varianteId);
    const cant = Number(cantidad);

    return prisma.itemCarrito.upsert({
      where: {
        carritoId_varianteId: {
          carritoId: idCarrito,
          varianteId: idVariante,
        },
      },
      update: {
        cantidad: {
          increment: cant,
        },
      },
      create: {
        carritoId: idCarrito,
        varianteId: idVariante,
        cantidad: cant,
      },
    });
  },

  /**
   * Actualiza la cantidad de un item del carrito.
   */
  async actualizarCantidad(itemId, cantidad) {
    return prisma.itemCarrito.update({
      where: {
        id: Number(itemId),
      },
      data: {
        cantidad: Number(cantidad),
      },
    });
  },

  /**
   * Elimina un item del carrito.
   */
  async eliminarItem(itemId) {
    return prisma.itemCarrito.delete({
      where: {
        id: Number(itemId),
      },
    });
  },

  /**
   * Obtiene el carrito junto con sus items,
   * variantes y productos para calcular el resumen.
   *
   * `client` es opcional: la creación del pedido lo lee dentro de su
   * transacción, después de tomar el lock del carrito (bloquearPorUsuario).
   */
  async obtenerConItems(carritoId, client = prisma) {
    return client.carrito.findUnique({
      where: {
        id: Number(carritoId),
      },
      include: {
        items: {
          include: {
            variante: {
              include: {
                producto: true,
              },
            },
          },
        },
      },
    });
  },

  /**
   * Sprint 4 / RF-030: toma el lock de la fila del carrito del usuario
   * (SELECT ... FOR UPDATE, parametrizado) dentro de la transacción `client`
   * y devuelve { id } o null si el usuario nunca tuvo carrito. Dos
   * creaciones de pedido simultáneas desde el mismo carrito se serializan: la
   * segunda espera a que la primera confirme y recién entonces lee los items
   * (ya vacíos). Agregar o editar items también espera: la FK de ItemCarrito
   * pide un lock compartido sobre esta fila.
   */
  async bloquearPorUsuario(usuarioId, client) {
    const filas =
      await client.$queryRaw`SELECT id FROM Carrito WHERE usuarioId = ${Number(usuarioId)} FOR UPDATE`;

    return filas[0] ? { id: Number(filas[0].id) } : null;
  },

  /**
   * Borra todos los items del carrito (el carrito queda vacío, no se borra).
   * Se usa al crear el pedido, dentro de su transacción.
   */
  async vaciar(carritoId, client = prisma) {
    return client.itemCarrito.deleteMany({
      where: {
        carritoId: Number(carritoId),
      },
    });
  },
};

module.exports = carritoRepository;
