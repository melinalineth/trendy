const prisma = require("../config/prisma");

// RF-017: RN-002 dice que el stock nunca puede quedar negativo, pero el
// campo Variante.stock no tiene un CHECK a nivel de columna (Prisma/MySQL no
// modelan eso limpiamente vía schema.prisma) — la regla se hace cumplir acá,
// leyendo el stock actual DENTRO de la misma transacción que lo actualiza,
// para evitar una condición de carrera entre el "leer stock" y el
// "escribir stock" si dos ajustes llegan casi al mismo tiempo para la misma
// variante.
//
// Dos errores de dominio separados (mismo criterio que
// ProductoNoEncontradoError/VarianteDuplicadaError en variante.service.js):
// que la variante no exista es un 404, que el ajuste deje el stock en
// negativo es un 409 — son causas distintas y el controller necesita
// distinguirlas.
class VarianteNoEncontradaError extends Error {}
class StockInsuficienteError extends Error {
  constructor(message, varianteId) {
    super(message);
    // Qué variante dejó sin stock al pedido (RF-019): el llamador (checkout)
    // puede avisarle al cliente cuál línea no alcanza.
    this.varianteId = varianteId;
  }
}

// RF-019: entrada inválida al descuento por pedido (items vacío, cantidad no
// entera > 0, etc.). `status`/`codigo` viajan en el error para que el
// errorHandler lo formatee como 400 sin tener que registrarlo en su lista.
class DescuentoInvalidoError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.codigo = "DESCUENTO_INVALIDO";
  }
}

const MOTIVO_PEDIDO_CONFIRMADO = "Pedido confirmado";

const esEnteroPositivo = (valor) => Number.isInteger(valor) && valor > 0;

// Valida las líneas y suma las repetidas de la misma variante. Devuelve
// [{ varianteId, cantidad }] ordenado por varianteId: tomar los locks de fila
// siempre en el mismo orden evita deadlocks entre dos pedidos simultáneos
// que comparten variantes pero las listan en distinto orden.
// Es defensivo a propósito: una cantidad negativa pasaría la condición
// `stock >= cantidad` y terminaría SUMANDO stock.
function agruparItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new DescuentoInvalidoError("El pedido debe tener al menos una línea");
  }

  const porVariante = new Map();

  for (const item of items) {
    if (!item || !esEnteroPositivo(item.varianteId)) {
      throw new DescuentoInvalidoError("Cada línea requiere un varianteId entero positivo");
    }
    if (!esEnteroPositivo(item.cantidad)) {
      throw new DescuentoInvalidoError("La cantidad de cada línea debe ser un entero mayor que 0");
    }
    porVariante.set(item.varianteId, (porVariante.get(item.varianteId) ?? 0) + item.cantidad);
  }

  return [...porVariante]
    .map(([varianteId, cantidad]) => ({ varianteId, cantidad }))
    .sort((a, b) => a.varianteId - b.varianteId);
}

const inventarioRepository = {
  // (a) lee el stock actual de la variante, (b) si stockActual + cantidad
  // queda negativo aborta con un error de dominio (no deja que la DB
  // truene con algo genérico), (c) crea el InventarioMovimiento, (d)
  // actualiza Variante.stock — todo dentro de una única transacción para
  // que un fallo en cualquier paso revierta los anteriores.
  async registrarAjuste(varianteId, cantidad, tipoAjuste, motivo, usuarioId) {
    return prisma.$transaction(async (tx) => {
      const variante = await tx.variante.findUnique({
        where: { id: varianteId },
      });

      if (!variante) {
        throw new VarianteNoEncontradaError("La variante no existe");
      }

      const stockResultante = variante.stock + cantidad;

      if (stockResultante < 0) {
        throw new StockInsuficienteError(
          "El ajuste dejaría el stock en negativo"
        );
      }

      const movimiento = await tx.inventarioMovimiento.create({
        data: {
          varianteId,
          cantidad,
          tipoAjuste,
          motivo: motivo ?? null,
          usuarioId,
        },
      });

      const varianteActualizada = await tx.variante.update({
        where: { id: varianteId },
        data: { stock: stockResultante },
      });

      return { movimiento, variante: varianteActualizada };
    });
  },

  // RF-019: descuenta el stock de todas las líneas de un pedido en UNA
  // transacción (todo o nada) y registra un InventarioMovimiento SALIDA por
  // variante. A diferencia de registrarAjuste (leer y después escribir) acá
  // el descuento es un UPDATE condicional atómico —
  // `WHERE id = ? AND stock >= cantidad` + decrement—: MySQL toma el lock de
  // la fila, así dos pedidos simultáneos sobre el último stock no pueden
  // pasar ambos (RN-002: nunca stock negativo, nunca sobreventa). Si
  // `count` es 0 la fila no existe o no alcanza el stock; en ambos casos se
  // lanza un error de dominio y la transacción completa se revierte.
  //
  // opciones:
  //   - usuarioId (obligatorio): InventarioMovimiento.usuarioId es NOT NULL;
  //     el Pedido de Sprint 4 trae el usuario comprador.
  //   - pedidoId (opcional): se anota en el motivo para trazabilidad.
  //   - tx (opcional): cliente de una transacción abierta por el llamador
  //     (p. ej. la que crea el Pedido); si viene, se usa en vez de abrir una
  //     propia, así el descuento y el pedido confirman o revierten juntos.
  async descontarPorPedido(items, { usuarioId, pedidoId, tx } = {}) {
    const lineas = agruparItems(items);

    if (!esEnteroPositivo(usuarioId)) {
      throw new DescuentoInvalidoError("El descuento requiere el usuarioId que origina el pedido");
    }

    const motivo = esEnteroPositivo(pedidoId)
      ? `${MOTIVO_PEDIDO_CONFIRMADO} (pedido #${pedidoId})`
      : MOTIVO_PEDIDO_CONFIRMADO;

    const ejecutar = async (cliente) => {
      const movimientos = [];

      for (const { varianteId, cantidad } of lineas) {
        const { count } = await cliente.variante.updateMany({
          where: { id: varianteId, stock: { gte: cantidad } },
          data: { stock: { decrement: cantidad } },
        });

        if (count === 0) {
          const existe = await cliente.variante.findUnique({
            where: { id: varianteId },
            select: { id: true },
          });

          if (!existe) {
            throw new VarianteNoEncontradaError(`La variante ${varianteId} no existe`);
          }
          throw new StockInsuficienteError(
            `Stock insuficiente para la variante ${varianteId}`,
            varianteId
          );
        }

        // Delta firmado, igual que registrarAjuste: una SALIDA resta.
        movimientos.push(
          await cliente.inventarioMovimiento.create({
            data: { varianteId, cantidad: -cantidad, tipoAjuste: "SALIDA", motivo, usuarioId },
          })
        );
      }

      return { movimientos };
    };

    return tx ? ejecutar(tx) : prisma.$transaction(ejecutar);
  },

  // Stock actual de una variante ({ stock }) o null si no existe.
  async obtenerStock(varianteId) {
    return prisma.variante.findUnique({
      where: { id: varianteId },
      select: { stock: true },
    });
  },

  // Historial de movimientos de UNA variante, más reciente primero. Incluye
  // el usuario que hizo cada ajuste (columna "Usuario" del historial en el
  // panel de inventario).
  async listarPorVariante(varianteId) {
    return prisma.inventarioMovimiento.findMany({
      where: { varianteId },
      include: { usuario: true },
      orderBy: { creadoEn: "desc" },
    });
  },

  // Vista general de RF-017: una fila por VARIANTE (no por movimiento) con
  // su stock actual, que es lo que el panel de inventario necesita listar y
  // sobre lo que se dispara "Ajustar stock"/"Ver historial" (usando el id de
  // la variante, no el de un movimiento).
  async listarTodo() {
    return prisma.variante.findMany({
      include: { producto: { select: { id: true, nombre: true } } },
      orderBy: { id: "asc" },
    });
  },
};

module.exports = inventarioRepository;
module.exports.VarianteNoEncontradaError = VarianteNoEncontradaError;
module.exports.StockInsuficienteError = StockInsuficienteError;
module.exports.DescuentoInvalidoError = DescuentoInvalidoError;
