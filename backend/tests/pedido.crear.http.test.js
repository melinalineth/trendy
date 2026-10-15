// Tests HTTP de la creación de pedidos a partir del carrito (RF-030, RN-002
// stock nunca negativo, RN-003 aislamiento, RN-006 contra entrega por zona,
// RN-007 revalidar stock, RN-008 precios históricos) y del alta de InfoEnvio
// (RF-027).
//
// Endpoint: POST /api/v1/pedidos (cliente). El stock se descuenta en la MISMA
// transacción que crea el pedido (queda reservado desde la creación).
//
// Uso: DATABASE_URL=mysql://... npm test
const { describe, it, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");

const carritoRepository = require("../src/repositories/carrito.repository");
const {
  prisma,
  iniciarServidor,
  pedir,
  crearUsuario,
  crearVariante,
  crearZona,
  crearDireccion,
  agregarAlCarrito,
  itemsDelCarrito,
  limpiar,
} = require("./helpers/entorno");

const RUTA = "/api/v1/pedidos";

function assertErrorEstandar(respuesta, status, codigo) {
  assert.equal(respuesta.status, status, JSON.stringify(respuesta.body));
  assert.deepEqual(Object.keys(respuesta.body.error).sort(), ["codigo", "detalles", "mensaje"]);
  assert.equal(respuesta.body.error.codigo, codigo);
}

describe("Creación de pedidos desde el carrito (RF-030)", () => {
  let servidor;
  let api;
  let admin;
  let vendedor;

  const stockDe = async (id) => (await prisma.variante.findUnique({ where: { id } })).stock;
  const movimientosDe = (varianteId) =>
    prisma.inventarioMovimiento.findMany({ where: { varianteId }, orderBy: { id: "asc" } });
  const pedidosDe = (usuarioId) => prisma.pedido.findMany({ where: { usuarioId } });

  // Cliente con una dirección en una zona con cobertura (tarifa `costo`).
  async function clienteConDireccion({ costo = "12000.00", permiteContraEntrega = false } = {}) {
    const cliente = await crearUsuario("cliente");
    const zona = await crearZona({ costo, permiteContraEntrega });
    const direccion = await crearDireccion(cliente.id, {
      ciudad: zona.ciudad,
      departamento: zona.departamento,
    });
    return { ...cliente, direccion, zona };
  }

  const crear = (cliente, body) =>
    api("POST", RUTA, {
      token: cliente.token,
      body: body ?? { direccionId: cliente.direccion.id, metodoPago: "MERCADO_PAGO" },
    });

  before(async () => {
    servidor = await iniciarServidor();
    api = (metodo, ruta, opciones) => pedir(servidor.baseUrl, metodo, ruta, opciones);
    admin = await crearUsuario("admin");
    vendedor = await crearUsuario("vendedor");
  });

  after(async () => {
    mock.restoreAll();
    await servidor.cerrar();
    await limpiar();
  });

  describe("autenticación y roles", () => {
    it("sin token -> 401", async () => {
      const r = await api("POST", RUTA, { body: { direccionId: 1, metodoPago: "MERCADO_PAGO" } });
      assert.equal(r.status, 401);
    });

    it("admin o vendedor -> 403 ACCESO_DENEGADO (solo el cliente crea pedidos, ERS 4.1)", async () => {
      for (const usuario of [admin, vendedor]) {
        const r = await api("POST", RUTA, {
          token: usuario.token,
          body: { direccionId: 1, metodoPago: "MERCADO_PAGO" },
        });
        assertErrorEstandar(r, 403, "ACCESO_DENEGADO");
      }
    });
  });

  describe("body inválido -> 400 VALIDACION_FALLIDA con detalles", () => {
    for (const [nombre, body] of [
      ["vacío", {}],
      ["sin metodoPago", { direccionId: 1 }],
      ["metodoPago desconocido", { direccionId: 1, metodoPago: "BITCOIN" }],
      ["direccionId string", { direccionId: "1", metodoPago: "MERCADO_PAGO" }],
      ["direccionId decimal", { direccionId: 1.5, metodoPago: "MERCADO_PAGO" }],
      ["direccionId negativo", { direccionId: -3, metodoPago: "MERCADO_PAGO" }],
      // El total lo calcula el servidor: un total o líneas en el body se rechazan.
      ["campos extra (total)", { direccionId: 1, metodoPago: "MERCADO_PAGO", total: 1 }],
      ["campos extra (items)", { direccionId: 1, metodoPago: "MERCADO_PAGO", items: [] }],
    ]) {
      it(nombre, async () => {
        const cliente = await crearUsuario("cliente");
        const r = await api("POST", RUTA, { token: cliente.token, body });
        assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
        assert.ok(Array.isArray(r.body.error.detalles) && r.body.error.detalles.length > 0);
      });
    }
  });

  it("crea el pedido: 201, PENDIENTE, líneas con precio vigente, InfoEnvio EN_PREPARACION, stock descontado y carrito vacío", async () => {
    const cliente = await clienteConDireccion({ costo: "12000.00" });
    const camisa = await crearVariante({ precio: "19990.50", stock: 10 });
    const pantalon = await crearVariante({ precio: "35000.00", stock: 4 });
    await agregarAlCarrito(cliente.id, camisa, 2);
    await agregarAlCarrito(cliente.id, pantalon, 3);

    const r = await crear(cliente);

    assert.equal(r.status, 201, JSON.stringify(r.body));
    const { pedido } = r.body;
    assert.equal(typeof r.body.mensaje, "string");
    assert.equal(pedido.estado, "PENDIENTE");
    assert.equal(pedido.metodoPago, "MERCADO_PAGO");
    assert.equal(pedido.usuarioId, cliente.id);
    assert.equal(pedido.direccionId, cliente.direccion.id);
    assert.match(pedido.numero, /^PED-\d+$/);
    // 2 x 19990.50 + 3 x 35000 = 144981 ; + 12000 de envío
    assert.equal(pedido.subtotal, 144981);
    assert.equal(pedido.costoEnvio, 12000);
    assert.equal(pedido.total, 156981);

    const lineas = [...pedido.detalles].sort((a, b) => a.varianteId - b.varianteId);
    assert.equal(lineas.length, 2);
    assert.deepEqual(
      lineas.map((d) => [d.varianteId, d.cantidad, d.precioUnitario]),
      [
        [camisa.id, 2, 19990.5],
        [pantalon.id, 3, 35000],
      ].sort((a, b) => a[0] - b[0])
    );
    for (const linea of lineas) {
      assert.equal(typeof linea.variante.producto.nombre, "string");
      assert.equal(linea.variante.talla, "M");
      assert.equal(linea.variante.color, "Rojo");
    }

    assert.equal(pedido.infoEnvio.estadoEnvio, "EN_PREPARACION");
    assert.equal(pedido.infoEnvio.costoEnvio, 12000);
    assert.equal(pedido.infoEnvio.direccionId, cliente.direccion.id);
    assert.ok(pedido.infoEnvio.actualizadoEn);

    // Base: stock reservado desde la creación y un movimiento SALIDA por línea.
    assert.equal(await stockDe(camisa.id), 8);
    assert.equal(await stockDe(pantalon.id), 1);
    for (const [variante, cantidad] of [
      [camisa, 2],
      [pantalon, 3],
    ]) {
      const movimientos = await movimientosDe(variante.id);
      assert.equal(movimientos.length, 1);
      assert.equal(movimientos[0].tipoAjuste, "SALIDA");
      assert.equal(movimientos[0].cantidad, -cantidad);
      assert.equal(movimientos[0].usuarioId, cliente.id);
      assert.ok(movimientos[0].motivo.includes(`#${pedido.id}`), movimientos[0].motivo);
    }

    const enBase = await prisma.pedido.findUnique({
      where: { id: pedido.id },
      include: { infoEnvio: true, detalles: true },
    });
    assert.equal(enBase.total.toFixed(2), "156981.00");
    assert.equal(enBase.infoEnvio.estadoEnvio, "EN_PREPARACION");
    assert.deepEqual(await itemsDelCarrito(cliente.id), []);
  });

  it("totales exactos en centavos con precios decimales (sin errores de coma flotante)", async () => {
    const cliente = await clienteConDireccion({ costo: "0.35" });
    // En float: 0.1 * 3 = 0.30000000000000004 y 0.1 + 0.2 = 0.30000000000000004.
    const a = await crearVariante({ precio: "0.10", stock: 10 });
    const b = await crearVariante({ precio: "0.20", stock: 10 });
    const c = await crearVariante({ precio: "19990.55", stock: 10 });
    await agregarAlCarrito(cliente.id, a, 3);
    await agregarAlCarrito(cliente.id, b, 1);
    await agregarAlCarrito(cliente.id, c, 3);

    const r = await crear(cliente);

    assert.equal(r.status, 201, JSON.stringify(r.body));
    // 0.30 + 0.20 + 59971.65 = 59972.15 ; + 0.35 = 59972.50
    const enBase = await prisma.pedido.findUnique({ where: { id: r.body.pedido.id } });
    assert.equal(enBase.subtotal.toFixed(2), "59972.15");
    assert.equal(enBase.costoEnvio.toFixed(2), "0.35");
    assert.equal(enBase.total.toFixed(2), "59972.50");
    assert.equal(r.body.pedido.total, 59972.5);
  });

  it("precio histórico (RN-008): cambiar el precio del producto después no altera el pedido", async () => {
    const cliente = await clienteConDireccion();
    const variante = await crearVariante({ precio: "50000.00", stock: 5 });
    await agregarAlCarrito(cliente.id, variante, 1);

    const r = await crear(cliente);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    await prisma.producto.update({ where: { id: variante.productoId }, data: { precio: "99999.99" } });

    // La consulta por HTTP (GET /pedidos/:id) se prueba en pedido.consulta.
    const detalles = await prisma.detallePedido.findMany({ where: { pedidoId: r.body.pedido.id } });
    assert.equal(detalles.length, 1);
    assert.equal(detalles[0].precioUnitario.toFixed(2), "50000.00");
    const pedido = await prisma.pedido.findUnique({ where: { id: r.body.pedido.id } });
    assert.equal(pedido.subtotal.toFixed(2), "50000.00");
  });

  it("contra entrega en una zona que lo permite (RN-006): 201 con metodoPago CONTRA_ENTREGA", async () => {
    const cliente = await clienteConDireccion({ permiteContraEntrega: true });
    const variante = await crearVariante({ stock: 5 });
    await agregarAlCarrito(cliente.id, variante, 1);

    const r = await crear(cliente, {
      direccionId: cliente.direccion.id,
      metodoPago: "CONTRA_ENTREGA",
    });

    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.pedido.metodoPago, "CONTRA_ENTREGA");
    assert.equal(await stockDe(variante.id), 4);
  });

  describe("rechazos sin efectos (nada a medias)", () => {
    // Afirma que no quedó nada: ni pedido, ni stock tocado, ni movimientos, y
    // el carrito sigue como estaba.
    async function assertSinEfectos(cliente, variantes, stocks, carritoAntes) {
      assert.deepEqual(await pedidosDe(cliente.id), []);
      for (const [i, variante] of variantes.entries()) {
        assert.equal(await stockDe(variante.id), stocks[i]);
        assert.deepEqual(await movimientosDe(variante.id), []);
      }
      assert.deepEqual(await itemsDelCarrito(cliente.id), carritoAntes);
    }

    it("carrito vacío -> 409 CARRITO_VACIO (también si nunca tuvo carrito)", async () => {
      const sinCarrito = await clienteConDireccion();
      assertErrorEstandar(await crear(sinCarrito), 409, "CARRITO_VACIO");

      const conCarritoVacio = await clienteConDireccion();
      const variante = await crearVariante();
      await agregarAlCarrito(conCarritoVacio.id, variante, 1);
      await prisma.itemCarrito.deleteMany({ where: { carrito: { usuarioId: conCarritoVacio.id } } });
      assertErrorEstandar(await crear(conCarritoVacio), 409, "CARRITO_VACIO");
      assert.deepEqual(await pedidosDe(conCarritoVacio.id), []);
    });

    it("dirección ajena -> 404 DIRECCION_NO_ENCONTRADA (RN-003), igual que una inexistente", async () => {
      const cliente = await clienteConDireccion();
      const otro = await clienteConDireccion();
      const variante = await crearVariante({ stock: 5 });
      await agregarAlCarrito(cliente.id, variante, 2);
      const carritoAntes = await itemsDelCarrito(cliente.id);

      const ajena = await crear(cliente, { direccionId: otro.direccion.id, metodoPago: "MERCADO_PAGO" });
      assertErrorEstandar(ajena, 404, "DIRECCION_NO_ENCONTRADA");
      const inexistente = await crear(cliente, { direccionId: 2147483000, metodoPago: "MERCADO_PAGO" });
      assertErrorEstandar(inexistente, 404, "DIRECCION_NO_ENCONTRADA");
      assert.equal(ajena.body.error.mensaje, inexistente.body.error.mensaje);

      await assertSinEfectos(cliente, [variante], [5], carritoAntes);
    });

    it("dirección sin cobertura -> 409 SIN_COBERTURA", async () => {
      const cliente = await crearUsuario("cliente");
      const direccion = await crearDireccion(cliente.id); // ciudad sin zona
      const variante = await crearVariante({ stock: 5 });
      await agregarAlCarrito(cliente.id, variante, 2);
      const carritoAntes = await itemsDelCarrito(cliente.id);

      const r = await api("POST", RUTA, {
        token: cliente.token,
        body: { direccionId: direccion.id, metodoPago: "MERCADO_PAGO" },
      });

      assertErrorEstandar(r, 409, "SIN_COBERTURA");
      await assertSinEfectos(cliente, [variante], [5], carritoAntes);
    });

    it("contra entrega en una zona que NO lo permite -> 409 CONTRA_ENTREGA_NO_DISPONIBLE (RN-006)", async () => {
      const cliente = await clienteConDireccion({ permiteContraEntrega: false });
      const variante = await crearVariante({ stock: 5 });
      await agregarAlCarrito(cliente.id, variante, 2);
      const carritoAntes = await itemsDelCarrito(cliente.id);

      const r = await crear(cliente, { direccionId: cliente.direccion.id, metodoPago: "CONTRA_ENTREGA" });

      assertErrorEstandar(r, 409, "CONTRA_ENTREGA_NO_DISPONIBLE");
      await assertSinEfectos(cliente, [variante], [5], carritoAntes);
    });

    it("producto inactivo en el carrito -> 409 PRODUCTO_NO_DISPONIBLE con la variante en detalles", async () => {
      const cliente = await clienteConDireccion();
      const activa = await crearVariante({ stock: 5 });
      const inactiva = await crearVariante({ stock: 5, estado: "INACTIVO" });
      await agregarAlCarrito(cliente.id, activa, 1);
      await agregarAlCarrito(cliente.id, inactiva, 1);
      const carritoAntes = await itemsDelCarrito(cliente.id);

      const r = await crear(cliente);

      assertErrorEstandar(r, 409, "PRODUCTO_NO_DISPONIBLE");
      assert.deepEqual(r.body.error.detalles, { varianteId: inactiva.id });
      await assertSinEfectos(cliente, [activa, inactiva], [5, 5], carritoAntes);
    });

    it("stock insuficiente -> 409 STOCK_INSUFICIENTE con { varianteId, disponible } y TODO se revierte", async () => {
      const cliente = await clienteConDireccion();
      // La primera línea (id menor) SÍ alcanza y se descuenta antes de que
      // falle la segunda: la transacción tiene que revertir ese descuento.
      const alcanza = await crearVariante({ stock: 5 });
      const noAlcanza = await crearVariante({ stock: 1 });
      await agregarAlCarrito(cliente.id, alcanza, 2);
      await agregarAlCarrito(cliente.id, noAlcanza, 3);
      const carritoAntes = await itemsDelCarrito(cliente.id);

      const r = await crear(cliente);

      assertErrorEstandar(r, 409, "STOCK_INSUFICIENTE");
      assert.deepEqual(r.body.error.detalles, { varianteId: noAlcanza.id, disponible: 1 });
      await assertSinEfectos(cliente, [alcanza, noAlcanza], [5, 1], carritoAntes);
      assert.equal(await prisma.infoEnvio.count({ where: { pedido: { usuarioId: cliente.id } } }), 0);
    });

    it("si algo falla DESPUÉS de descontar (al vaciar el carrito), el descuento también se revierte", async () => {
      const cliente = await clienteConDireccion();
      const variante = await crearVariante({ stock: 5 });
      await agregarAlCarrito(cliente.id, variante, 2);
      const carritoAntes = await itemsDelCarrito(cliente.id);
      const mockVaciar = mock.method(carritoRepository, "vaciar", async () => {
        throw new Error("falla simulada al vaciar el carrito");
      });
      const mockLog = mock.method(console, "error", () => {});

      let r;
      try {
        r = await crear(cliente);
      } finally {
        mockVaciar.mock.restore();
        mockLog.mock.restore();
      }

      assert.equal(r.status, 500, JSON.stringify(r.body));
      assert.equal(mockVaciar.mock.callCount(), 1);
      await assertSinEfectos(cliente, [variante], [5], carritoAntes);
    });
  });

  describe("reintento ante deadlock (P2034)", () => {
    // Error con la forma que lanza Prisma cuando MySQL elige la transacción
    // como víctima de un deadlock (MySQL ya revirtió todo lo de esa víctima).
    function errorDeadlock() {
      const error = new Error("Transaction failed due to a write conflict or a deadlock");
      error.code = "P2034";
      return error;
    }

    it("un deadlock transitorio se reintenta: 201, un solo pedido, stock descontado una vez y queda log", async () => {
      const cliente = await clienteConDireccion();
      const variante = await crearVariante({ stock: 5 });
      await agregarAlCarrito(cliente.id, variante, 2);
      const original = carritoRepository.vaciar;
      let llamadas = 0;
      const mockVaciar = mock.method(carritoRepository, "vaciar", async (...args) => {
        llamadas++;
        if (llamadas === 1) throw errorDeadlock();
        return original.apply(carritoRepository, args);
      });
      const mockLog = mock.method(console, "error", () => {});

      let r;
      try {
        r = await crear(cliente);
      } finally {
        mockVaciar.mock.restore();
        mockLog.mock.restore();
      }

      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(llamadas, 2);
      assert.equal((await pedidosDe(cliente.id)).length, 1);
      assert.equal(await stockDe(variante.id), 3);
      assert.equal((await movimientosDe(variante.id)).length, 1);
      assert.deepEqual(await itemsDelCarrito(cliente.id), []);
      const linea = mockLog.mock.calls
        .map((c) => c.arguments.join(" "))
        .find((l) => l.includes("TRANSACCION_REINTENTADA"));
      assert.ok(linea);
      assert.deepEqual(JSON.parse(linea), {
        evento: "TRANSACCION_REINTENTADA",
        operacion: "CREAR_PEDIDO",
        intento: 1,
        codigo: "P2034",
      });
    });

    it("si el deadlock persiste, se rinde a los 3 intentos y no queda nada a medias", async () => {
      const cliente = await clienteConDireccion();
      const variante = await crearVariante({ stock: 5 });
      await agregarAlCarrito(cliente.id, variante, 2);
      const mockVaciar = mock.method(carritoRepository, "vaciar", async () => {
        throw errorDeadlock();
      });
      const mockLog = mock.method(console, "error", () => {});

      let r;
      try {
        r = await crear(cliente);
      } finally {
        mockVaciar.mock.restore();
        mockLog.mock.restore();
      }

      assert.equal(r.status, 500, JSON.stringify(r.body));
      assert.equal(mockVaciar.mock.callCount(), 3);
      assert.deepEqual(await pedidosDe(cliente.id), []);
      assert.equal(await stockDe(variante.id), 5);
      assert.deepEqual(await movimientosDe(variante.id), []);
      assert.equal((await itemsDelCarrito(cliente.id)).length, 1);
    });
  });

  describe("concurrencia", () => {
    for (const simultaneos of [2, 6]) {
      it(`${simultaneos} POST simultáneos desde el MISMO carrito -> exactamente 1 pedido y stock descontado una vez`, async () => {
        const cliente = await clienteConDireccion();
        const variante = await crearVariante({ stock: 100 });
        await agregarAlCarrito(cliente.id, variante, 2);

        const respuestas = await Promise.all(
          Array.from({ length: simultaneos }, () => crear(cliente))
        );

        const estados = respuestas.map((r) => r.status).sort();
        assert.deepEqual(
          estados,
          [201, ...Array(simultaneos - 1).fill(409)],
          JSON.stringify(respuestas.map((r) => r.body))
        );
        for (const r of respuestas.filter((x) => x.status === 409)) {
          assert.equal(r.body.error.codigo, "CARRITO_VACIO");
        }
        assert.equal((await pedidosDe(cliente.id)).length, 1);
        assert.equal(await stockDe(variante.id), 98);
        assert.equal((await movimientosDe(variante.id)).length, 1);
      });
    }

    it("2 clientes compiten por la ÚLTIMA unidad: exactamente uno gana, stock final 0 (nunca negativo)", async () => {
      for (let ronda = 0; ronda < 5; ronda++) {
        const ana = await clienteConDireccion();
        const beto = await clienteConDireccion();
        const variante = await crearVariante({ stock: 1 });
        await agregarAlCarrito(ana.id, variante, 1);
        await agregarAlCarrito(beto.id, variante, 1);

        const [ra, rb] = await Promise.all([crear(ana), crear(beto)]);

        const resultados = [ra.status, rb.status].sort();
        assert.deepEqual(resultados, [201, 409], JSON.stringify([ra.body, rb.body]));
        const [ganador, perdedor] = ra.status === 201 ? [ana, beto] : [beto, ana];
        const rechazo = ra.status === 409 ? ra : rb;
        assertErrorEstandar(rechazo, 409, "STOCK_INSUFICIENTE");
        assert.deepEqual(rechazo.body.error.detalles, { varianteId: variante.id, disponible: 0 });

        assert.equal(await stockDe(variante.id), 0);
        assert.equal((await pedidosDe(ganador.id)).length, 1);
        assert.equal((await pedidosDe(perdedor.id)).length, 0);
        // El perdedor conserva su carrito.
        assert.equal((await itemsDelCarrito(perdedor.id)).length, 1);
        assert.equal((await movimientosDe(variante.id)).length, 1);
      }
    });
  });
});
