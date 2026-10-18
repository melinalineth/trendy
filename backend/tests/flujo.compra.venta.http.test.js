// Test de integración del flujo de compra con pago contra entrega, por HTTP
// real, de punta a punta (Sprint 5, tarjeta 06-01):
//
//   carrito -> pedido CONTRA_ENTREGA -> pago contra entrega -> confirmación
//   del personal (nace la venta) -> consulta de ventas -> cancelación (la
//   venta se ANULA y el stock se repone una sola vez).
//
// Es UNA historia: los pasos `it` comparten estado y dependen del anterior
// (node:test los corre en orden, uno tras otro, dentro del mismo `describe`).
// Cada paso comprueba por HTTP y, donde importa, directo en la base, que
// stock, pedido, pago, envío y venta quedan coherentes entre sí.
//
// Aislamiento: la venta nace "ahora", por eso NO se usan conteos ni totales
// globales. La venta se localiza siempre por `pedidoId` y las consultas se
// acotan con desde/hasta (días de Bogotá, UTC-5 todo el año).
//
// Requiere correr con `--test-concurrency=1` (como el script `test` del
// proyecto): comparte la base con los demás archivos de test.
const { describe, it, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");

const {
  prisma,
  iniciarServidor,
  pedir,
  crearUsuario,
  crearVariante,
  crearZona,
  crearDireccion,
  limpiar,
} = require("./helpers/entorno");

function assertErrorEstandar(respuesta, status, codigo) {
  assert.equal(respuesta.status, status, JSON.stringify(respuesta.body));
  assert.deepEqual(Object.keys(respuesta.body.error).sort(), ["codigo", "detalles", "mensaje"]);
  assert.equal(respuesta.body.error.codigo, codigo);
}

// Fecha de calendario (YYYY-MM-DD) en Bogotá para el instante dado.
const diaEnBogota = (instante = Date.now()) =>
  new Date(instante - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

// Ejecuta `fn` silenciando console.error (los logs de eventos de venta).
async function sinLogs(fn) {
  const silencio = mock.method(console, "error", () => {});
  try {
    return await fn();
  } finally {
    silencio.mock.restore();
  }
}

describe("Flujo de compra contra entrega: carrito -> pedido -> pago -> venta -> cancelación", () => {
  let servidor;
  let api;
  let cliente;
  let otroCliente;
  let admin;
  let segundoAdmin;
  let vendedor;
  let zona;
  let direccion;
  let variante;
  let desde;

  // Estado que se va armando paso a paso.
  let pedido; // cuerpo del pedido creado (POST /pedidos)
  let ventaConfirmada; // fila Venta tras la confirmación
  let ventaDelListado; // venta tal como la devuelve GET /ventas

  const STOCK_INICIAL = 10;
  const CANTIDAD = 2;
  const PRECIO = 19990;
  const ENVIO = 12000;
  const SUBTOTAL = PRECIO * CANTIDAD; // 39980
  const TOTAL = SUBTOTAL + ENVIO; // 51980

  const stockActual = async () =>
    (await prisma.variante.findUnique({ where: { id: variante.id } })).stock;
  const pedidoEnBase = () => prisma.pedido.findUnique({ where: { id: pedido.id } });
  const ventaEnBase = () => prisma.venta.findUnique({ where: { pedidoId: pedido.id } });
  const cuantasVentas = () => prisma.venta.count({ where: { pedidoId: pedido.id } });
  const pagoEnBase = () => prisma.pago.findUnique({ where: { pedidoId: pedido.id } });
  const infoEnvioEnBase = () => prisma.infoEnvio.findUnique({ where: { pedidoId: pedido.id } });
  const movimientos = (tipoAjuste) =>
    prisma.inventarioMovimiento.findMany({
      where: { varianteId: variante.id, tipoAjuste },
      orderBy: { id: "asc" },
    });

  // Busca la venta del pedido en GET /ventas (acotado a hoy, Bogotá), página a
  // página: otros archivos de test también crean ventas "ahora".
  async function ventaListada(usuario) {
    const hasta = diaEnBogota();
    for (let pagina = 1; ; pagina++) {
      const r = await api(
        "GET",
        `/api/v1/ventas?desde=${desde}&hasta=${hasta}&limite=100&pagina=${pagina}`,
        { token: usuario.token }
      );
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const encontrada = r.body.ventas.find((v) => v.pedidoId === pedido.id);
      if (encontrada) return encontrada;
      if (pagina >= r.body.paginacion.totalPaginas) return undefined;
    }
  }

  before(async () => {
    desde = diaEnBogota();
    servidor = await iniciarServidor();
    api = (metodo, ruta, opciones) => pedir(servidor.baseUrl, metodo, ruta, opciones);
    admin = await crearUsuario("admin");
    segundoAdmin = await crearUsuario("admin");
    vendedor = await crearUsuario("vendedor");
    cliente = await crearUsuario("cliente");
    otroCliente = await crearUsuario("cliente");

    // (1) Zona que PERMITE contra entrega, dirección del cliente en ella y una
    // variante con stock y precio conocidos.
    zona = await crearZona({ costo: `${ENVIO}.00`, permiteContraEntrega: true });
    direccion = await crearDireccion(cliente.id, {
      ciudad: zona.ciudad,
      departamento: zona.departamento,
    });
    variante = await crearVariante({ precio: `${PRECIO}.00`, stock: STOCK_INICIAL });
  });

  after(async () => {
    mock.restoreAll();
    await servidor.cerrar();
    await limpiar();
  });

  it("(2) el cliente agrega 2 unidades al carrito y el resumen trae subtotal y envío de la zona", async () => {
    const agregado = await api("POST", "/api/v1/carrito/items", {
      token: cliente.token,
      body: { varianteId: variante.id, cantidad: CANTIDAD },
    });
    assert.equal(agregado.status, 201, JSON.stringify(agregado.body));

    const r = await api("GET", `/api/v1/carrito/resumen?direccionId=${direccion.id}`, {
      token: cliente.token,
    });

    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.vacio, false);
    assert.equal(r.body.subtotal, SUBTOTAL);
    assert.equal(r.body.costoEnvio, ENVIO);
    assert.equal(r.body.total, TOTAL);
    // Agregar al carrito no toca el stock: se descuenta recién al crear el pedido.
    assert.equal(await stockActual(), STOCK_INICIAL);
  });

  it("(3) crea el pedido CONTRA_ENTREGA: 201, PENDIENTE, total = subtotal + envío, stock 10 -> 8, carrito vacío, envío EN_PREPARACION", async () => {
    const r = await api("POST", "/api/v1/pedidos", {
      token: cliente.token,
      body: { direccionId: direccion.id, metodoPago: "CONTRA_ENTREGA" },
    });

    assert.equal(r.status, 201, JSON.stringify(r.body));
    pedido = r.body.pedido;
    assert.equal(pedido.estado, "PENDIENTE");
    assert.equal(pedido.metodoPago, "CONTRA_ENTREGA");
    assert.equal(pedido.usuarioId, cliente.id);
    assert.equal(pedido.subtotal, SUBTOTAL);
    assert.equal(pedido.costoEnvio, ENVIO);
    assert.equal(pedido.total, pedido.subtotal + pedido.costoEnvio);
    assert.equal(pedido.total, TOTAL);
    assert.equal(pedido.detalles.length, 1);
    assert.equal(pedido.detalles[0].varianteId, variante.id);
    assert.equal(pedido.detalles[0].cantidad, CANTIDAD);
    assert.equal(pedido.detalles[0].precioUnitario, PRECIO);

    assert.equal(await stockActual(), STOCK_INICIAL - CANTIDAD);
    const salidas = await movimientos("SALIDA");
    assert.equal(salidas.length, 1);
    assert.equal(salidas[0].cantidad, -CANTIDAD, "delta firmado: una SALIDA resta");
    assert.deepEqual(await movimientos("ENTRADA"), []);

    const carrito = await api("GET", "/api/v1/carrito", { token: cliente.token });
    assert.equal(carrito.status, 200, JSON.stringify(carrito.body));
    assert.equal(carrito.body.vacio, true);
    assert.deepEqual(carrito.body.items, []);

    const envio = await infoEnvioEnBase();
    assert.equal(envio.estadoEnvio, "EN_PREPARACION");
    assert.equal(envio.direccionId, direccion.id);
    assert.equal(Number(envio.costoEnvio), ENVIO);

    // Todavía no hay pago ni venta.
    assert.equal(await pagoEnBase(), null);
    assert.equal(await cuantasVentas(), 0);
  });

  it("(4) registra el pago contra entrega: queda PENDIENTE y todavía NO hay venta (ni por API ni en base)", async () => {
    const r = await api("POST", "/api/v1/pagos/contra-entrega", {
      token: cliente.token,
      body: { pedidoId: pedido.id },
    });

    assert.equal(r.status, 201, JSON.stringify(r.body));
    const pago = await pagoEnBase();
    assert.equal(pago.estado, "PENDIENTE");
    assert.equal(pago.metodo, "CONTRA_ENTREGA");
    assert.equal(Number(pago.monto), TOTAL);
    assert.equal((await pedidoEnBase()).estado, "PENDIENTE");

    assert.equal(await cuantasVentas(), 0);
    assert.equal(await ventaListada(admin), undefined, "GET /ventas no debe traer la venta aún");
    assert.equal(await stockActual(), STOCK_INICIAL - CANTIDAD);
  });

  it("(5) el admin pasa el pedido a CONFIRMADO: 200 y nace la venta", async () => {
    const r = await api("PATCH", `/api/v1/pedidos/${pedido.id}/estado`, {
      token: admin.token,
      body: { estado: "CONFIRMADO" },
    });

    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.pedido.estado, "CONFIRMADO");
    assert.equal((await pedidoEnBase()).estado, "CONFIRMADO");
    assert.equal(await cuantasVentas(), 1);
    ventaConfirmada = await ventaEnBase();
    assert.equal(ventaConfirmada.estado, "REGISTRADA");
    assert.equal(ventaConfirmada.responsableId, admin.id);
    assert.equal(ventaConfirmada.clienteId, cliente.id);
    assert.equal(ventaConfirmada.metodoPago, "CONTRA_ENTREGA");
    // Confirmar no vuelve a descontar stock.
    assert.equal(await stockActual(), STOCK_INICIAL - CANTIDAD);
  });

  it("(6) GET /ventas: el admin y el vendedor ven la MISMA venta REGISTRADA con los montos del pedido; el cliente recibe 403", async () => {
    const deAdmin = await ventaListada(admin);
    const deVendedor = await ventaListada(vendedor);

    assert.ok(deAdmin, "la venta tiene que figurar en el listado del admin");
    ventaDelListado = deAdmin;
    assert.deepEqual(deVendedor, deAdmin);

    assert.equal(deAdmin.id, ventaConfirmada.id);
    assert.equal(deAdmin.pedidoId, pedido.id);
    assert.equal(deAdmin.numeroPedido, pedido.numero);
    assert.equal(deAdmin.estado, "REGISTRADA");
    assert.equal(deAdmin.estadoPedido, "CONFIRMADO");
    assert.equal(deAdmin.metodoPago, "CONTRA_ENTREGA");
    assert.equal(deAdmin.anuladaPor, null);
    assert.equal(deAdmin.anuladaEn, null);
    assert.deepEqual(deAdmin.responsable, { id: admin.id, nombre: "Test admin" });
    assert.deepEqual(deAdmin.cliente, { id: cliente.id, nombre: "Test cliente" });
    // Montos IGUALES a los del pedido.
    assert.strictEqual(deAdmin.subtotal, pedido.subtotal);
    assert.strictEqual(deAdmin.costoEnvio, pedido.costoEnvio);
    assert.strictEqual(deAdmin.total, pedido.total);
    assert.strictEqual(deAdmin.total, TOTAL);
    // Línea con el precio histórico.
    assert.equal(deAdmin.productos.length, 1);
    assert.equal(deAdmin.productos[0].sku, variante.sku);
    assert.strictEqual(deAdmin.productos[0].cantidad, CANTIDAD);
    assert.strictEqual(deAdmin.productos[0].precioUnitario, PRECIO);
    assert.strictEqual(deAdmin.productos[0].subtotal, SUBTOTAL);

    // El cliente no consulta ventas.
    const prohibido = await api("GET", `/api/v1/ventas?desde=${desde}&hasta=${diaEnBogota()}`, {
      token: cliente.token,
    });
    assertErrorEstandar(prohibido, 403, "ACCESO_DENEGADO");
  });

  it("(7) RN-008: si el admin cambia el precio del producto después, la venta y el pedido conservan los montos de la compra", async () => {
    const r = await api("PUT", `/api/v1/productos/${variante.productoId}`, {
      token: admin.token,
      body: { precio: 1000 },
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const producto = await prisma.producto.findUnique({ where: { id: variante.productoId } });
    assert.equal(Number(producto.precio), 1000, "el precio vigente sí cambió");

    const venta = await ventaListada(admin);
    assert.deepEqual(venta, ventaDelListado, "la venta no cambia en nada");
    assert.strictEqual(venta.total, TOTAL);
    assert.strictEqual(venta.productos[0].precioUnitario, PRECIO);

    const enBase = await ventaEnBase();
    assert.equal(enBase.total.toFixed(2), `${TOTAL}.00`);
    const detalle = await api("GET", `/api/v1/pedidos/${pedido.id}`, { token: cliente.token });
    assert.equal(detalle.status, 200, JSON.stringify(detalle.body));
    assert.equal(detalle.body.total, TOTAL);
    assert.equal(detalle.body.detalles[0].precioUnitario, PRECIO);
  });

  it("(8) otro admin CANCELA el pedido: stock 8 -> 10 con un solo movimiento, pago CANCELADO, venta ANULADA por él (el responsable sigue siendo el primer admin) y el envío intacto", async () => {
    const envioAntes = await infoEnvioEnBase();
    const historialAntes = await prisma.historialEstadoEnvio.findMany({
      where: { infoEnvio: { pedidoId: pedido.id } },
      orderBy: { id: "asc" },
    });
    assert.equal(await stockActual(), STOCK_INICIAL - CANTIDAD);

    const r = await sinLogs(() =>
      api("PATCH", `/api/v1/pedidos/${pedido.id}/cancelar`, { token: segundoAdmin.token })
    );

    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.yaCancelado, false);
    assert.equal(r.body.pedido.estado, "CANCELADO");
    assert.equal((await pedidoEnBase()).estado, "CANCELADO");
    // Stock repuesto exactamente una vez.
    assert.equal(await stockActual(), STOCK_INICIAL);
    const entradas = await movimientos("ENTRADA");
    assert.equal(entradas.length, 1);
    assert.equal(entradas[0].cantidad, CANTIDAD);
    // El pago contra entrega que no se va a cobrar queda CANCELADO.
    assert.equal((await pagoEnBase()).estado, "CANCELADO");

    // Venta: misma fila, ANULADA, sin borrarse ni reescribirse.
    assert.equal(await cuantasVentas(), 1);
    const anulada = await ventaEnBase();
    assert.equal(anulada.id, ventaConfirmada.id);
    assert.equal(anulada.estado, "ANULADA");
    assert.ok(anulada.anuladaEn instanceof Date);
    assert.ok(Math.abs(anulada.anuladaEn.getTime() - Date.now()) < 60_000);
    assert.equal(anulada.anuladaPorId, segundoAdmin.id);
    assert.equal(anulada.responsableId, admin.id, "responsable = quien la REGISTRÓ");
    assert.notEqual(anulada.anuladaPorId, anulada.responsableId);
    assert.equal(anulada.total.toFixed(2), ventaConfirmada.total.toFixed(2));
    assert.equal(anulada.registradaEn.getTime(), ventaConfirmada.registradaEn.getTime());

    // Lo mismo, visto por la API.
    const listada = await ventaListada(admin);
    assert.equal(listada.id, ventaConfirmada.id);
    assert.equal(listada.estado, "ANULADA");
    assert.equal(listada.estadoPedido, "CANCELADO");
    assert.equal(listada.anuladaEn, anulada.anuladaEn.toISOString());
    assert.deepEqual(listada.anuladaPor, { id: segundoAdmin.id, nombre: "Test admin" });
    assert.deepEqual(listada.responsable, { id: admin.id, nombre: "Test admin" });
    assert.notEqual(listada.anuladaPor.id, listada.responsable.id);
    assert.strictEqual(listada.total, TOTAL, "la venta anulada conserva sus montos");

    // El filtro estado=ANULADA la incluye.
    const filtrada = await api(
      "GET",
      `/api/v1/ventas?desde=${desde}&hasta=${diaEnBogota()}&estado=ANULADA&limite=100`,
      { token: admin.token }
    );
    assert.equal(filtrada.status, 200, JSON.stringify(filtrada.body));
    assert.ok(filtrada.body.ventas.some((v) => v.pedidoId === pedido.id));

    // InfoEnvio y su historial: exactamente como estaban.
    assert.deepEqual(await infoEnvioEnBase(), envioAntes);
    assert.deepEqual(
      await prisma.historialEstadoEnvio.findMany({
        where: { infoEnvio: { pedidoId: pedido.id } },
        orderBy: { id: "asc" },
      }),
      historialAntes
    );
  });

  it("(9) una segunda cancelación es idempotente: 200 yaCancelado, no repone de nuevo y no pisa anuladaPor ni anuladaEn", async () => {
    const antes = await ventaEnBase();

    const r = await sinLogs(() =>
      api("PATCH", `/api/v1/pedidos/${pedido.id}/cancelar`, { token: vendedor.token })
    );

    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.yaCancelado, true);
    assert.equal(await stockActual(), STOCK_INICIAL);
    assert.equal((await movimientos("ENTRADA")).length, 1);
    assert.equal(await cuantasVentas(), 1);
    const despues = await ventaEnBase();
    assert.equal(despues.estado, "ANULADA");
    assert.equal(despues.anuladaPorId, segundoAdmin.id, "no pisa a quien anuló primero");
    assert.equal(despues.anuladaEn.getTime(), antes.anuladaEn.getTime());
    assert.equal((await pagoEnBase()).estado, "CANCELADO");
  });

  it("(10) el cliente ve su pedido CANCELADO, no puede cancelarlo (403) y otro cliente no lo ve", async () => {
    const propio = await api("GET", `/api/v1/pedidos/${pedido.id}`, { token: cliente.token });
    assert.equal(propio.status, 200, JSON.stringify(propio.body));
    assert.equal(propio.body.id, pedido.id);
    assert.equal(propio.body.estado, "CANCELADO");
    assert.equal(propio.body.total, TOTAL);

    const cancelar = await api("PATCH", `/api/v1/pedidos/${pedido.id}/cancelar`, {
      token: cliente.token,
    });
    assertErrorEstandar(cancelar, 403, "ACCESO_DENEGADO");
    assert.equal((await pedidoEnBase()).estado, "CANCELADO");
    assert.equal(await stockActual(), STOCK_INICIAL);

    // RN-003: un cliente ajeno no obtiene datos del pedido.
    const ajeno = await api("GET", `/api/v1/pedidos/${pedido.id}`, { token: otroCliente.token });
    assert.ok([403, 404].includes(ajeno.status), JSON.stringify(ajeno.body));
    assert.equal(ajeno.body.numero, undefined);
    assert.equal(ajeno.body.total, undefined);
  });
});
