const prisma = require("../config/prisma");

// RF-017: RN-002 dice que el stock nunca puede quedar negativo, pero el
// campo Variante.stock no tiene un CHECK a nivel de columna (Prisma/MySQL no
// modelan eso limpiamente vía schema.prisma) — la regla se hace cumplir acá
// con un UPDATE condicional atómico (ver registrarAjuste y
// descontarPorPedido), no leyendo el stock y escribiendo después.
//
// Dos errores de dominio separados (mismo criterio que
// ProductoNoEncontradoError/VarianteDuplicadaError en variante.service.js):
// que la variante no exista es un 404, que el ajuste deje el stock en
// negativo es un 409 — son causas distintas y el controller necesita
// distinguirlas (inventario.controller usa instanceof).
//
// `status`/`codigo`/`detalles` viajan en la instancia para que errorHandler
// los formatee (DDS §5.3) si algún día se dejan propagar sin try/catch, sin
// tener que registrarlos en su lista (que apunta a la StockInsuficienteError
// de carrito.service, otra clase).
class VarianteNoEncontradaError extends Error {
  constructor(message) {
    super(message);
    this.name = "VarianteNoEncontradaError";
    this.status = 404;
    this.codigo = "VARIANTE_NO_ENCONTRADA";
  }
}

class StockInsuficienteError extends Error {
  constructor(message, varianteId, disponible) {
    super(message);
    this.name = "StockInsuficienteError";
    this.status = 409;
    this.codigo = "STOCK_INSUFICIENTE";
    // Qué variante dejó sin stock al pedido (RF-019): el llamador (checkout)
    // puede avisarle al cliente cuál línea no alcanza.
    this.varianteId = varianteId;
    // DDS §5.3: { varianteId, disponible } cuando se conoce la variante.
    if (varianteId !== undefined) {
      this.detalles = { varianteId, disponible };
    }
  }
}

// RF-019: entrada inválida al descuento por pedido (items vacío, cantidad no
// entera > 0, etc.). `status`/`codigo` viajan en el error para que el
// errorHandler lo formatee como 400 sin tener que registrarlo en su lista.
class DescuentoInvalidoError extends Error {
  constructor(message) {
    super(message);
    this.name = "DescuentoInvalidoError";
    this.status = 400;
    this.codigo = "DESCUENTO_INVALIDO";
  }
}

const MOTIVO_PEDIDO_CONFIRMADO = "Pedido confirmado";

// Las columnas Int de MySQL son de 32 bits con signo: pasado ese tope Prisma
// tira un error genérico de la base en vez de uno de dominio.
const INT32_MAX = 2147483647;

const esEnteroPositivo = (valor) => Number.isInteger(valor) && valor > 0 && valor <= INT32_MAX;

// Falló un UPDATE condicional (count === 0): o la variante no existe o el
// stock no alcanzaba. Un solo helper para que ambas operaciones lancen
// exactamente los mismos errores.
// Los mensajes los pasa cada operación porque el controller de RF-017 los
// devuelve tal cual en su respuesta HTTP y no deben cambiar.
async function lanzarPorFilaNoActualizada(cliente, varianteId, mensajeNoExiste, mensajeSinStock) {
  const variante = await cliente.variante.findUnique({
    where: { id: varianteId },
    select: { stock: true },
  });

  if (!variante) {
    throw new VarianteNoEncontradaError(mensajeNoExiste);
  }
  throw new StockInsuficienteError(mensajeSinStock, varianteId, variante.stock);
}

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
      throw new DescuentoInvalidoError(
        `Cada línea requiere un varianteId entero entre 1 y ${INT32_MAX}`
      );
    }
    if (!esEnteroPositivo(item.cantidad)) {
      throw new DescuentoInvalidoError(
        `La cantidad de cada línea debe ser un entero entre 1 y ${INT32_MAX}`
      );
    }

    // La suma de duplicadas también tiene que caber en Int32.
    const suma = (porVariante.get(item.varianteId) ?? 0) + item.cantidad;
    if (suma > INT32_MAX) {
      throw new DescuentoInvalidoError(
        `La cantidad total de la variante ${item.varianteId} supera ${INT32_MAX}`
      );
    }
    porVariante.set(item.varianteId, suma);
  }

  return [...porVariante]
    .map(([varianteId, cantidad]) => ({ varianteId, cantidad }))
    .sort((a, b) => a.varianteId - b.varianteId);
}

const inventarioRepository = {
  // `cantidad` es el delta firmado a aplicar sobre Variante.stock. El ajuste
  // es un UPDATE atómico relativo (`increment`), no "leer stock, sumar en
  // memoria y escribir el valor absoluto": ese patrón, sobre un snapshot
  // REPEATABLE READ, pisa un descuento concurrente (lost update -> sobreventa).
  //   - delta negativo: `WHERE id = ? AND stock >= -delta`; count 0 = la
  //     variante no existe o el stock no alcanza (RN-002).
  //   - delta positivo: increment sin condición.
  // El movimiento se inserta DESPUÉS, con el lock de la fila ya tomado: crearlo
  // antes tomaría un lock S por la FK y el UPDATE posterior pediría X, receta
  // de deadlock entre dos ajustes concurrentes. Todo en una única transacción,
  // y mismo contrato externo de siempre ({ movimiento, variante }, mismos
  // errores y mensajes).
  async registrarAjuste(varianteId, cantidad, tipoAjuste, motivo, usuarioId) {
    // Una variante fuera del rango de Int32 no puede existir.
    if (!esEnteroPositivo(varianteId)) {
      throw new VarianteNoEncontradaError("La variante no existe");
    }
    if (!Number.isInteger(cantidad) || Math.abs(cantidad) > INT32_MAX) {
      throw new DescuentoInvalidoError(
        `La cantidad del ajuste debe ser un entero con valor absoluto de hasta ${INT32_MAX}`
      );
    }

    return prisma.$transaction(async (tx) => {
      const { count } = await tx.variante.updateMany({
        where: cantidad < 0 ? { id: varianteId, stock: { gte: -cantidad } } : { id: varianteId },
        data: { stock: { increment: cantidad } },
      });

      // Con delta 0 el UPDATE puede no "cambiar" filas aunque la variante
      // exista; solo en ese caso no alcanza `count` para saber si existe.
      if (count === 0 && cantidad !== 0) {
        await lanzarPorFilaNoActualizada(
          tx,
          varianteId,
          "La variante no existe",
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

      // Si con delta 0 la variante no existía, la FK del movimiento ya hizo
      // fallar la transacción; acá la fila existe y se lee ya actualizada.
      const variante = await tx.variante.findUnique({ where: { id: varianteId } });

      return { movimiento, variante };
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
  //   - usuarioId (obligatorio): InventarioMovimiento.usuarioId es NOT NULL.
  //     El movimiento queda atribuido al usuario comprador del pedido (no
  //     hay usuario "sistema"), así que quien llame debe pasar
  //     pedido.usuarioId.
  //   - pedidoId (opcional): SOLO se anota en el motivo para trazabilidad.
  //   - tx (opcional): cliente de una transacción abierta por el llamador
  //     (p. ej. la que crea el Pedido); si viene, se usa en vez de abrir una
  //     propia, así el descuento y el pedido confirman o revierten juntos.
  //     Debe ser el cliente que recibe el callback de prisma.$transaction,
  //     NUNCA el `prisma` raíz: con éste cada operación correría en su propia
  //     conexión/transacción y se perdería la atomicidad.
  //
  // IMPORTANTE — NO es idempotente: llamarla dos veces con el mismo pedidoId
  // descuenta dos veces. La idempotencia (RN-009: un evento de pago repetido
  // no descuenta de nuevo) y la reposición de stock por cancelación (ERS
  // RF-019) quedan para Sprint 4 y requieren un guard o una columna que
  // identifique el pedido en InventarioMovimiento (hoy no existe: cambiar el
  // schema está fuera del alcance de esta tarjeta).
  async descontarPorPedido(items, { usuarioId, pedidoId, tx } = {}) {
    const lineas = agruparItems(items);

    if (!esEnteroPositivo(usuarioId)) {
      throw new DescuentoInvalidoError(
        `El descuento requiere el usuarioId (entero entre 1 y ${INT32_MAX}) que origina el pedido`
      );
    }
    if (pedidoId != null && !esEnteroPositivo(pedidoId)) {
      throw new DescuentoInvalidoError(`El pedidoId debe ser un entero entre 1 y ${INT32_MAX}`);
    }

    const motivo =
      pedidoId != null
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
          await lanzarPorFilaNoActualizada(
            cliente,
            varianteId,
            `La variante ${varianteId} no existe`,
            `Stock insuficiente para la variante ${varianteId}`
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
