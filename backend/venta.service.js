
const ventaRepository = require("../repositories/venta.repository");

const ESTADOS_QUE_CUENTAN = [
  "CONFIRMADO",
  "EN_PREPARACION",
  "ENVIADO",
  "EN_TRANSITO",
  "ENTREGADO",
];



const registrarVentaDePedido = async (
  pedidoId,
  { tx, responsableId = null } = {}
) => {
  const pedido = await ventaRepository.obtenerPedidoParaVenta(pedidoId, {
    tx,
  });

  if (!pedido) {
    throw crearErrorNegocio(
      "El pedido no existe.",
      404,
      "PEDIDO_NO_ENCONTRADO"
    );
  }

  if (!ESTADOS_QUE_CUENTAN.includes(pedido.estado)) {
    throw crearErrorNegocio(
      "El pedido todavía no está confirmado para registrar una venta.",
      409,
      "PEDIDO_NO_CONFIRMADO",
      { estado: pedido.estado }
    );
  }

  const ventaExistente = await ventaRepository.buscarPorPedido(pedidoId, {
    tx,
  });

  if (ventaExistente) {
    return { venta: ventaExistente, creada: false };
  }

  try {
    const venta = await ventaRepository.crear(
      {
        pedidoId: pedido.id,
        responsableId,
        subtotal: pedido.subtotal,
        costoEnvio: pedido.costoEnvio,
        total: pedido.total,
        metodoPago: pedido.metodoPago,
      },
      { tx }
    );

    return { venta, creada: true };
  } catch (error) {
    // Una venta por pedido: la restricción UNIQUE de pedidoId
    // resuelve la carrera entre dos llamadas simultáneas.
    if (error.code === "P2002") {
      const ventaExistente = await ventaRepository.buscarPorPedido(
        pedidoId,
        { tx }
      );

      if (ventaExistente) {
        return { venta: ventaExistente, creada: false };
      }
    }

    throw error;
  }
};

const anularVentaDePedido = async (pedidoId, { tx } = {}) => {
  const count = await ventaRepository.anular(pedidoId, { tx });

  return { anulada: count > 0 };
};






const crearErrorNegocio = (mensaje, status, codigo, detalles = null) => {
  const error = new Error(mensaje);
  error.status = status;
  error.codigo = codigo;
  error.detalles = detalles;
  return error;
};

const numeroSeguro = (valor) => {
  if (valor === null || valor === undefined) {
    return 0;
  }

  return Number(valor);
};

// Conservar aquí las implementaciones existentes de:
// registrarVentaDePedido(...)
// anularVentaDePedido(...)

const consultar = async (filtros, usuario) => {
  const { pagina, limite } = filtros;
  const skip = (pagina - 1) * limite;
  const take = limite;
  const esAdmin = usuario.rol === "admin";

  // Los vendedores todavía no se pueden filtrar por asignaciones:
  // el esquema actual no relaciona vendedores con productos o pedidos.
  // Esa limitación queda pendiente para v2.0.

  const consultas = [
    ventaRepository.listar(filtros, { skip, take }),
    ventaRepository.contar(filtros),
  ];

  if (esAdmin) {
    consultas.push(ventaRepository.totalesPorEstado(filtros));
  }

  const [ventas, total, grupos] = await Promise.all(consultas);

  const datos = ventas.map((venta) => ({
    id: venta.id,
    fecha: venta.registradaEn.toISOString(),
    estado: venta.estado,
    anuladaEn: venta.anuladaEn,
    metodoPago: venta.metodoPago,
    subtotal: numeroSeguro(venta.subtotal),
    costoEnvio: numeroSeguro(venta.costoEnvio),
    total: numeroSeguro(venta.total),

    cliente: venta.cliente
      ? {
          id: venta.cliente.id,
          nombre: venta.cliente.nombre,
        }
      : null,

    responsable: venta.responsable
      ? {
          id: venta.responsable.id,
          nombre: venta.responsable.nombre,
        }
      : null,

    pedido: {
      id: venta.pedido.id,
      numero: venta.pedido.numero,
      estado: venta.pedido.estado,
    },

    productos: venta.pedido.detalles.map((detalle) => {
      const precioUnitario = numeroSeguro(detalle.precioUnitario);

      return {
        id: detalle.id,
        sku: detalle.variante.sku,
        producto: detalle.variante.producto.nombre,
        talla: detalle.variante.talla,
        color: detalle.variante.color,
        cantidad: detalle.cantidad,
        precioUnitario,
        subtotal: precioUnitario * detalle.cantidad,
      };
    }),
  }));

  const respuesta = {
    datos,
    paginacion: {
      pagina,
      limite,
      total,
      totalPaginas: Math.ceil(total / limite),
    },
  };

  if (esAdmin) {
    const totales = {
      REGISTRADA: { cantidad: 0, valorTotal: 0 },
      ANULADA: { cantidad: 0, valorTotal: 0 },
    };

    for (const grupo of grupos) {
      if (Object.hasOwn(totales, grupo.estado)) {
        totales[grupo.estado] = {
          cantidad: grupo._count._all,
          valorTotal: numeroSeguro(grupo._sum.total),
        };
      }
    }

    respuesta.totales = totales;
  }

  return respuesta;
};

module.exports = {
  ESTADOS_QUE_CUENTAN,
  registrarVentaDePedido,
  anularVentaDePedido,
  consultar,
};



