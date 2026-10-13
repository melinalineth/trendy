// backend/src/services/pago.service.js

const prisma = require("../../prisma/client");
const inventarioRepository = require("../repositories/inventario.repository");

const {
  MercadoPagoConfig,
  Preference,
  Payment,
  WebhookSignatureValidator,
} = require("mercadopago");

class PedidoNoEncontradoError extends Error {
  constructor(message = "El pedido no existe o no pertenece al usuario") {
    super(message);
    this.name = "PedidoNoEncontradoError";
  }
}

class PagoInvalidoError extends Error {
  constructor(message = "El pago no es válido") {
    super(message);
    this.name = "PagoInvalidoError";
  }
}

function obtenerClienteMercadoPago() {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("Falta configurar MERCADOPAGO_ACCESS_TOKEN");
  }

  return new MercadoPagoConfig({
    accessToken,
    options: { timeout: 5000 },
  });
}

/**
 * Crea una preferencia de Checkout Pro usando los datos reales
 * guardados en el pedido.
 */
async function crearPreferencia(pedidoId, usuarioId) {
  const id = Number(pedidoId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new PagoInvalidoError("El identificador del pedido no es válido");
  }

  const pedido = await prisma.pedido.findFirst({
    where: {
      id,
      usuarioId: Number(usuarioId),
    },
    include: {
      detalles: {
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

  if (!pedido) {
    throw new PedidoNoEncontradoError();
  }

  if (pedido.estado !== "PENDIENTE") {
    throw new PagoInvalidoError(
      "Solo se pueden pagar pedidos pendientes"
    );
  }

  if (!pedido.detalles || pedido.detalles.length === 0) {
    throw new PagoInvalidoError("El pedido no contiene productos");
  }

  const items = pedido.detalles.map((detalle) => {
    const precio = Number(detalle.precioUnitario);
    const cantidad = Number(detalle.cantidad);
    const nombre =
      detalle.variante?.producto?.nombre ||
      `Producto ${detalle.varianteId}`;

    if (
      !Number.isFinite(precio) ||
      precio <= 0 ||
      !Number.isInteger(cantidad) ||
      cantidad <= 0
    ) {
      throw new PagoInvalidoError(
        "El pedido contiene un producto con datos inválidos"
      );
    }

    return {
      id: String(detalle.varianteId),
      title: nombre,
      quantity: cantidad,
      unit_price: precio,
      currency_id: "COP",
    };
  });

  const cliente = obtenerClienteMercadoPago();
  const preference = new Preference(cliente);

  const resultado = await preference.create({
    body: {
      items,
      external_reference: String(pedido.id),
      metadata: {
        pedido_id: pedido.id,
      },
      // Configura esta URL pública en tu entorno.
      ...(process.env.MERCADOPAGO_WEBHOOK_URL
        ? { notification_url: process.env.MERCADOPAGO_WEBHOOK_URL }
        : {}),
    },
  });

  if (!resultado.init_point) {
    throw new Error("Mercado Pago no devolvió la URL de checkout");
  }

  return {
    pedidoId: pedido.id,
    preferenciaId: resultado.id,
    checkoutUrl: resultado.init_point,
  };
}

/**
 * Verifica la firma, consulta el pago directamente a Mercado Pago
 * y actualiza el pedido sin volver a descontar inventario.
 *
 * firma debe tener: xSignature, xRequestId y dataId.
 */
async function procesarWebhook(payload, firma) {
  const secreto = process.env.MERCADOPAGO_WEBHOOK_SECRET;

  if (!secreto) {
    throw new Error("Falta configurar MERCADOPAGO_WEBHOOK_SECRET");
  }

  if (!firma?.xSignature || !firma?.dataId) {
    throw new PagoInvalidoError("Faltan datos para validar el webhook");
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature: firma.xSignature,
      xRequestId: firma.xRequestId || "",
      dataId: String(firma.dataId),
      secret: secreto,
    });
  } catch {
    throw new PagoInvalidoError("La firma del webhook no es válida");
  }

  // Ignorar notificaciones que no correspondan a pagos.
  if (payload?.type !== "payment") {
    return { recibido: true, procesado: false };
  }

  const paymentId = String(firma.dataId);

  const cliente = obtenerClienteMercadoPago();
  const paymentClient = new Payment(cliente);

  // No confiar en el estado enviado en el cuerpo del webhook.
  const pagoMP = await paymentClient.get({ id: paymentId });

  const pedidoId = Number(
    pagoMP.external_reference || pagoMP.metadata?.pedido_id
  );

  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    throw new PagoInvalidoError(
      "El pago no contiene una referencia válida al pedido"
    );
  }

  // Comprobar que el pago corresponde al importe real del pedido.
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { detalles: true, pago: true },
  });

  if (!pedido) {
    throw new PedidoNoEncontradoError();
  }

  if (
    Number(pagoMP.transaction_amount) !== Number(pedido.total)
  ) {
    throw new PagoInvalidoError(
      "El importe del pago no coincide con el total del pedido"
    );
  }

  if (pagoMP.status === "approved") {
    return prisma.$transaction(async (tx) => {
      const pagoActual = await tx.pago.findUnique({
        where: { pedidoId },
      });

      // Idempotencia: un pago aprobado no se procesa nuevamente.
      if (pagoActual?.estado === "APROBADO") {
        return { recibido: true, procesado: false };
      }

      if (
        pedido.estado !== "PENDIENTE" &&
        pedido.estado !== "PAGO_APROBADO"
      ) {
        throw new PagoInvalidoError(
          "El pedido ya no está en un estado válido para aprobar el pago"
        );
      }

      await tx.pago.upsert({
        where: { pedidoId },
        create: {
          pedidoId,
          metodo: "MERCADOPAGO",
          estado: "APROBADO",
          referenciaExterna: paymentId,
          monto: Number(pagoMP.transaction_amount),
        },
        update: {
          estado: "APROBADO",
          referenciaExterna: paymentId,
          monto: Number(pagoMP.transaction_amount),
        },
      });

      // Registrar el estado intermedio y luego confirmar el pedido.
      await tx.pedido.update({
        where: { id: pedidoId },
        data: { estado: "PAGO_APROBADO" },
      });

      await tx.pedido.update({
        where: { id: pedidoId },
        data: { estado: "CONFIRMADO" },
      });

      // El inventario se descontó al crear el pedido.
      // NO volver a descontarlo aquí.

      return { recibido: true, procesado: true };
    });
  }

  if (pagoMP.status === "rejected") {
    // La liberación debe ser idempotente y transaccional.
    // Verifica que registrarAjuste acepte el cliente tx para que
    // el ajuste y el cambio de estado se confirmen juntos.
    return prisma.$transaction(async (tx) => {
      const pagoActual = await tx.pago.findUnique({
        where: { pedidoId },
      });

      if (pagoActual?.estado === "RECHAZADO") {
        return { recibido: true, procesado: false };
      }

      if (pedido.estado !== "PENDIENTE") {
        throw new PagoInvalidoError(
          "El pedido ya no está pendiente de pago"
        );
      }

      for (const detalle of pedido.detalles) {
        await inventarioRepository.registrarAjuste(
          {
            varianteId: detalle.varianteId,
            tipo: "ENTRADA",
            cantidad: detalle.cantidad,
            motivo: "Pedido rechazado",
            pedidoId,
          },
          tx
        );
      }

      await tx.pago.upsert({
        where: { pedidoId },
        create: {
          pedidoId,
          metodo: "MERCADOPAGO",
          estado: "RECHAZADO",
          referenciaExterna: paymentId,
          monto: Number(pagoMP.transaction_amount),
        },
        update: {
          estado: "RECHAZADO",
          referenciaExterna: paymentId,
          monto: Number(pagoMP.transaction_amount),
        },
      });

      await tx.pedido.update({
        where: { id: pedidoId },
        data: { estado: "PAGO_RECHAZADO" },
      });

      return { recibido: true, procesado: true };
    });
  }

  // Pendiente, en proceso u otro estado: se reconoce la notificación,
  // pero no se modifica el pedido.
  return {
    recibido: true,
    procesado: false,
    estadoPago: pagoMP.status,
  };
}

module.exports = {
  crearPreferencia,
  procesarWebhook,
  PedidoNoEncontradoError,
  PagoInvalidoError,
};