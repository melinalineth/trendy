// Tests HTTP de la consulta y gestión de pedidos (RF-031, RF-032, RN-003,
// RN-008) y de la tabla de transiciones de EstadoPedido (ERS §4.2,
// docs/diseno/pedidos-estados.md).
//
// Endpoints:
//   GET   /api/v1/pedidos            cliente (solo los suyos), admin, vendedor
//   GET   /api/v1/pedidos/:id        dueño, admin, vendedor (ajeno -> 404)
//   PATCH /api/v1/pedidos/:id/estado admin, vendedor
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  prisma,
  iniciarServidor,
  pedir,
  crearUsuario,
  crearVariante,
  crearZona,
  crearDireccion,
  crearPedido,
  agregarAlCarrito,
  limpiar,
} = require("./helpers/entorno");

const ESTADOS_PEDIDO = [
  "PENDIENTE",
  "PAGO_APROBADO",
  "CONFIRMADO",
  "EN_PREPARACION",
  "ENVIADO",
  "EN_TRANSITO",
  "ENTREGADO",
  "CANCELADO",
  "PAGO_RECHAZADO",
  "PAGO_PENDIENTE",
];
const ESTADOS_ENVIO = ["EN_PREPARACION", "ENVIADO", "EN_TRANSITO", "ENTREGADO"];

// Transiciones manuales válidas (PATCH /estado). PENDIENTE -> CONFIRMADO
// solo para contra entrega con su pago registrado (Mercado Pago se confirma
// con el webhook). CANCELADO solo por /cancelar; los estados de pago solo los
// fija pago.service.
const VALIDAS = new Set([
  "PENDIENTE>CONFIRMADO",
  "PAGO_APROBADO>CONFIRMADO",
  "CONFIRMADO>EN_PREPARACION",
  "EN_PREPARACION>ENVIADO",
  "ENVIADO>EN_TRANSITO",
  "EN_TRANSITO>ENTREGADO",
]);

function assertErrorEstandar(respuesta, status, codigo) {
  assert.equal(respuesta.status, status, JSON.stringify(respuesta.body));
  assert.deepEqual(Object.keys(respuesta.body.error).sort(), ["codigo", "detalles", "mensaje"]);
  assert.equal(respuesta.body.error.codigo, codigo);
}

describe("Consulta y gestión de pedidos (RF-031, RF-032)", () => {
  let servidor;
  let api;
  let admin;
  let vendedor;

  async function clienteConDireccion({ permiteContraEntrega = true } = {}) {
    const cliente = await crearUsuario("cliente");
    const zona = await crearZona({ costo: "12000.00", permiteContraEntrega });
    const direccion = await crearDireccion(cliente.id, {
      ciudad: zona.ciudad,
      departamento: zona.departamento,
    });
    return { ...cliente, direccion };
  }

  async function pedidoReal(cliente, { metodoPago = "MERCADO_PAGO", precio = "19990.00" } = {}) {
    const variante = await crearVariante({ precio, stock: 10 });
    await agregarAlCarrito(cliente.id, variante, 2);
    const r = await api("POST", "/api/v1/pedidos", {
      token: cliente.token,
      body: { direccionId: cliente.direccion.id, metodoPago },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return { pedido: r.body.pedido, variante };
  }

  const listar = (usuario, query = "") =>
    api("GET", `/api/v1/pedidos${query}`, { token: usuario.token });
  const cambiarEstado = (pedidoId, estado, usuario = admin) =>
    api("PATCH", `/api/v1/pedidos/${pedidoId}/estado`, { token: usuario.token, body: { estado } });

  before(async () => {
    servidor = await iniciarServidor();
    api = (metodo, ruta, opciones) => pedir(servidor.baseUrl, metodo, ruta, opciones);
    admin = await crearUsuario("admin");
    vendedor = await crearUsuario("vendedor");
  });

  after(async () => {
    await servidor.cerrar();
    await limpiar();
  });

  describe("autenticación y roles", () => {
    it("sin token -> 401 en listar, detalle y cambio de estado", async () => {
      assert.equal((await api("GET", "/api/v1/pedidos")).status, 401);
      assert.equal((await api("GET", "/api/v1/pedidos/1")).status, 401);
      assert.equal(
        (await api("PATCH", "/api/v1/pedidos/1/estado", { body: { estado: "CONFIRMADO" } })).status,
        401
      );
    });

    it("el cliente no puede cambiar el estado -> 403 ACCESO_DENEGADO", async () => {
      const cliente = await clienteConDireccion();
      const { pedido } = await pedidoReal(cliente);
      assertErrorEstandar(await cambiarEstado(pedido.id, "CONFIRMADO", cliente), 403, "ACCESO_DENEGADO");
    });
  });

  describe("GET /api/v1/pedidos", () => {
    it("el cliente ve SOLO sus pedidos (RN-003), aunque mande usuarioId de otro", async () => {
      const ana = await clienteConDireccion();
      const beto = await clienteConDireccion();
      const a1 = await pedidoReal(ana);
      const a2 = await pedidoReal(ana);
      const b1 = await pedidoReal(beto);

      for (const query of ["", `?usuarioId=${beto.id}`]) {
        const r = await listar(ana, query);
        assert.equal(r.status, 200, JSON.stringify(r.body));
        const ids = r.body.pedidos.map((p) => p.id);
        assert.deepEqual(ids.sort(), [a1.pedido.id, a2.pedido.id].sort());
        assert.ok(!ids.includes(b1.pedido.id));
        assert.equal(r.body.paginacion.total, 2);
      }
    });

    it("cada pedido trae número, fecha, estado, total y líneas (RF-031); montos como número", async () => {
      const cliente = await clienteConDireccion();
      const { pedido } = await pedidoReal(cliente);

      const r = await listar(cliente);

      const item = r.body.pedidos.find((p) => p.id === pedido.id);
      assert.equal(item.numero, pedido.numero);
      assert.ok(item.creadoEn);
      assert.equal(item.estado, "PENDIENTE");
      assert.equal(item.total, 51980);
      assert.equal(item.detalles.length, 1);
      assert.equal(item.detalles[0].precioUnitario, 19990);
    });

    it("admin y vendedor ven pedidos de todos y filtran por cliente, estado y número (RF-032)", async () => {
      const ana = await clienteConDireccion();
      const beto = await clienteConDireccion();
      const a1 = await pedidoReal(ana);
      const b1 = await pedidoReal(beto);
      const b2 = await pedidoReal(beto);
      await prisma.pedido.update({ where: { id: b2.pedido.id }, data: { estado: "CONFIRMADO" } });

      for (const usuario of [admin, vendedor]) {
        const todosDeBeto = await listar(usuario, `?usuarioId=${beto.id}`);
        assert.equal(todosDeBeto.status, 200, JSON.stringify(todosDeBeto.body));
        assert.deepEqual(
          todosDeBeto.body.pedidos.map((p) => p.id).sort(),
          [b1.pedido.id, b2.pedido.id].sort()
        );
        // El listado de gestión incluye el cliente (sin datos sensibles).
        assert.deepEqual(Object.keys(todosDeBeto.body.pedidos[0].usuario).sort(), [
          "correo",
          "id",
          "nombre",
        ]);

        const confirmados = await listar(usuario, `?usuarioId=${beto.id}&estado=CONFIRMADO`);
        assert.deepEqual(confirmados.body.pedidos.map((p) => p.id), [b2.pedido.id]);

        const porNumero = await listar(usuario, `?numero=${a1.pedido.numero}`);
        assert.deepEqual(porNumero.body.pedidos.map((p) => p.id), [a1.pedido.id]);
      }
    });

    it("filtro por fechas en hora de Bogotá (UTC-5), 'hasta' inclusivo", async () => {
      const cliente = await clienteConDireccion();
      const variante = await crearVariante({ stock: 10 });
      const lineas = [{ variante, cantidad: 1 }];
      const base = { usuarioId: cliente.id, direccionId: cliente.direccion.id, lineas, estado: "CONFIRMADO" };
      // 2026-03-09 23:30 en Bogotá (04:30 UTC del 10).
      const nocheDel9 = await crearPedido({ ...base, creadoEn: new Date("2026-03-10T04:30:00Z") });
      // 2026-03-10 00:30 en Bogotá.
      const madrugadaDel10 = await crearPedido({ ...base, creadoEn: new Date("2026-03-10T05:30:00Z") });
      // 2026-03-10 23:59 en Bogotá (04:59 UTC del 11).
      const finDel10 = await crearPedido({ ...base, creadoEn: new Date("2026-03-11T04:59:00Z") });

      const ids = async (query) =>
        (await listar(admin, `?usuarioId=${cliente.id}${query}`)).body.pedidos.map((p) => p.id).sort();

      assert.deepEqual(await ids("&desde=2026-03-10&hasta=2026-03-10"), [madrugadaDel10.id, finDel10.id].sort());
      assert.deepEqual(await ids("&hasta=2026-03-09"), [nocheDel9.id]);
      assert.deepEqual(await ids("&desde=2026-03-11"), []);
      assert.deepEqual(
        await ids("&desde=2026-03-09"),
        [nocheDel9.id, madrugadaDel10.id, finDel10.id].sort()
      );
    });

    it("paginación con tope: más recientes primero, total y totalPaginas", async () => {
      const cliente = await clienteConDireccion();
      const variante = await crearVariante({ stock: 10 });
      const base = {
        usuarioId: cliente.id,
        direccionId: cliente.direccion.id,
        lineas: [{ variante, cantidad: 1 }],
        estado: "CONFIRMADO",
      };
      const viejo = await crearPedido({ ...base, creadoEn: new Date("2026-01-01T12:00:00Z") });
      const medio = await crearPedido({ ...base, creadoEn: new Date("2026-01-02T12:00:00Z") });
      const nuevo = await crearPedido({ ...base, creadoEn: new Date("2026-01-03T12:00:00Z") });

      const p1 = await listar(cliente, "?limite=2");
      assert.equal(p1.status, 200, JSON.stringify(p1.body));
      assert.deepEqual(p1.body.pedidos.map((p) => p.id), [nuevo.id, medio.id]);
      assert.deepEqual(p1.body.paginacion, { pagina: 1, limite: 2, total: 3, totalPaginas: 2 });

      const p2 = await listar(cliente, "?limite=2&pagina=2");
      assert.deepEqual(p2.body.pedidos.map((p) => p.id), [viejo.id]);

      const porDefecto = await listar(cliente);
      assert.equal(porDefecto.body.paginacion.limite, 20);
      assert.equal(porDefecto.body.paginacion.pagina, 1);
    });

    describe("query inválida -> 400 VALIDACION_FALLIDA", () => {
      for (const query of [
        "?limite=101",
        "?limite=0",
        "?pagina=0",
        "?pagina=abc",
        "?estado=FOO",
        "?desde=2026-02-30",
        "?desde=10-03-2026",
        "?desde=2026-03-11&hasta=2026-03-10",
        "?usuarioId=-1",
        "?otro=1",
        "?estado=PENDIENTE&estado=CONFIRMADO",
      ]) {
        it(query, async () => {
          const r = await listar(admin, query);
          assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
          assert.ok(r.body.error.detalles.length > 0);
        });
      }
    });
  });

  describe("GET /api/v1/pedidos/:id", () => {
    it("el dueño ve el detalle con precio HISTÓRICO (RN-008), pago e infoEnvio", async () => {
      const cliente = await clienteConDireccion();
      const { pedido, variante } = await pedidoReal(cliente, { metodoPago: "CONTRA_ENTREGA" });
      await prisma.producto.update({ where: { id: variante.productoId }, data: { precio: "1.00" } });
      await api("POST", "/api/v1/pagos/contra-entrega", {
        token: cliente.token,
        body: { pedidoId: pedido.id },
      });

      const r = await api("GET", `/api/v1/pedidos/${pedido.id}`, { token: cliente.token });

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.id, pedido.id);
      assert.equal(r.body.numero, pedido.numero);
      assert.equal(r.body.detalles[0].precioUnitario, 19990);
      assert.equal(r.body.detalles[0].subtotal, 39980);
      assert.equal(r.body.detalles[0].variante.producto.nombre.startsWith("Producto test"), true);
      assert.equal(r.body.subtotal, 39980);
      assert.equal(r.body.costoEnvio, 12000);
      assert.equal(r.body.total, 51980);
      assert.equal(r.body.pago.metodo, "CONTRA_ENTREGA");
      assert.equal(r.body.pago.estado, "PENDIENTE");
      assert.equal(r.body.infoEnvio.estadoEnvio, "EN_PREPARACION");
      assert.equal(r.body.direccion.id, cliente.direccion.id);
      assert.ok(!JSON.stringify(r.body).includes("passwordHash"));
    });

    it("pedido ajeno -> 404 PEDIDO_NO_ENCONTRADO, igual que uno inexistente; admin y vendedor lo ven", async () => {
      const duenio = await clienteConDireccion();
      const intruso = await crearUsuario("cliente");
      const { pedido } = await pedidoReal(duenio);

      const ajeno = await api("GET", `/api/v1/pedidos/${pedido.id}`, { token: intruso.token });
      const inexistente = await api("GET", "/api/v1/pedidos/2147483000", { token: intruso.token });
      assertErrorEstandar(ajeno, 404, "PEDIDO_NO_ENCONTRADO");
      assertErrorEstandar(inexistente, 404, "PEDIDO_NO_ENCONTRADO");
      assert.equal(ajeno.body.error.mensaje, inexistente.body.error.mensaje);

      for (const usuario of [admin, vendedor]) {
        const r = await api("GET", `/api/v1/pedidos/${pedido.id}`, { token: usuario.token });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.usuario.id, duenio.id);
      }
    });

    it("id inválido -> 400 VALIDACION_FALLIDA", async () => {
      const r = await api("GET", "/api/v1/pedidos/abc", { token: admin.token });
      assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
    });
  });

  describe("PATCH /api/v1/pedidos/:id/estado", () => {
    // Pedido de contra entrega con su Pago registrado (así PENDIENTE ->
    // CONFIRMADO es válido) y su InfoEnvio coherente con el estado (en los
    // estados de envío vale lo mismo que el pedido).
    async function pedidoEn(cliente, estado) {
      const variante = await crearVariante({ stock: 10 });
      const pedido = await crearPedido({
        usuarioId: cliente.id,
        direccionId: cliente.direccion.id,
        lineas: [{ variante, cantidad: 1 }],
        metodoPago: "CONTRA_ENTREGA",
        estado,
        estadoEnvio: ESTADOS_ENVIO.includes(estado) ? estado : "EN_PREPARACION",
      });
      await prisma.pago.create({
        data: { pedidoId: pedido.id, metodo: "CONTRA_ENTREGA", estado: "PENDIENTE", monto: pedido.total },
      });
      return pedido;
    }

    const estadoEnvioDe = async (pedidoId) =>
      (await prisma.infoEnvio.findUnique({ where: { pedidoId } })).estadoEnvio;

    it("tabla completa de transiciones: solo las válidas pasan; el resto 409 TRANSICION_ESTADO_INVALIDA sin cambios", async () => {
      const cliente = await clienteConDireccion();

      for (const desde of ESTADOS_PEDIDO) {
        for (const hacia of ESTADOS_PEDIDO) {
          const pedido = await pedidoEn(cliente, desde);
          const envioAntes = await estadoEnvioDe(pedido.id);

          const r = await cambiarEstado(pedido.id, hacia);
          const despues = (await prisma.pedido.findUnique({ where: { id: pedido.id } })).estado;

          if (VALIDAS.has(`${desde}>${hacia}`)) {
            assert.equal(r.status, 200, `${desde} -> ${hacia}: ${JSON.stringify(r.body)}`);
            assert.equal(r.body.pedido.estado, hacia);
            assert.equal(despues, hacia);
            // Invariante: en los estados de envío, InfoEnvio vale lo mismo.
            if (ESTADOS_ENVIO.includes(hacia)) {
              assert.equal(await estadoEnvioDe(pedido.id), hacia, `${desde} -> ${hacia}`);
            } else {
              assert.equal(await estadoEnvioDe(pedido.id), envioAntes);
            }
          } else {
            assertErrorEstandar(r, 409, "TRANSICION_ESTADO_INVALIDA");
            assert.equal(despues, desde, `${desde} -> ${hacia} cambió el pedido`);
            assert.equal(await estadoEnvioDe(pedido.id), envioAntes);
          }
        }
      }
    });

    it("recorrido completo por el vendedor: CONFIRMADO -> ... -> ENTREGADO, con InfoEnvio sincronizado", async () => {
      const cliente = await clienteConDireccion();
      const { pedido } = await pedidoReal(cliente, { metodoPago: "CONTRA_ENTREGA" });
      const pago = await api("POST", "/api/v1/pagos/contra-entrega", {
        token: cliente.token,
        body: { pedidoId: pedido.id },
      });
      assert.equal(pago.status, 201, JSON.stringify(pago.body));

      for (const estado of ["CONFIRMADO", "EN_PREPARACION", "ENVIADO", "EN_TRANSITO", "ENTREGADO"]) {
        const r = await cambiarEstado(pedido.id, estado, vendedor);
        assert.equal(r.status, 200, `${estado}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.pedido.estado, estado);
        assert.equal(r.body.pedido.infoEnvio.estadoEnvio, ESTADOS_ENVIO.includes(estado) ? estado : "EN_PREPARACION");
      }
    });

    it("Mercado Pago PENDIENTE -> CONFIRMADO a mano -> 409 (se confirma con el webhook del pago aprobado)", async () => {
      const cliente = await clienteConDireccion();
      const { pedido } = await pedidoReal(cliente, { metodoPago: "MERCADO_PAGO" });

      assertErrorEstandar(await cambiarEstado(pedido.id, "CONFIRMADO"), 409, "TRANSICION_ESTADO_INVALIDA");
    });

    it("contra entrega SIN el pago registrado -> 409 al confirmar", async () => {
      const cliente = await clienteConDireccion();
      const { pedido } = await pedidoReal(cliente, { metodoPago: "CONTRA_ENTREGA" });

      assertErrorEstandar(await cambiarEstado(pedido.id, "CONFIRMADO"), 409, "TRANSICION_ESTADO_INVALIDA");
    });

    it("pasar a un estado de envío sin InfoEnvio registrado -> 409 ENVIO_NO_REGISTRADO", async () => {
      const cliente = await clienteConDireccion();
      const variante = await crearVariante({ stock: 10 });
      const pedido = await crearPedido({
        usuarioId: cliente.id,
        direccionId: cliente.direccion.id,
        lineas: [{ variante, cantidad: 1 }],
        estado: "CONFIRMADO",
      });

      assertErrorEstandar(await cambiarEstado(pedido.id, "EN_PREPARACION"), 409, "ENVIO_NO_REGISTRADO");
      assert.equal((await prisma.pedido.findUnique({ where: { id: pedido.id } })).estado, "CONFIRMADO");
    });

    it("dos cambios SIMULTÁNEOS desde el mismo estado: exactamente uno gana (lock del pedido)", async () => {
      const cliente = await clienteConDireccion();
      for (let ronda = 0; ronda < 4; ronda++) {
        const pedido = await pedidoEn(cliente, "EN_PREPARACION");

        const respuestas = await Promise.all([
          cambiarEstado(pedido.id, "ENVIADO", admin),
          cambiarEstado(pedido.id, "ENVIADO", vendedor),
          cambiarEstado(pedido.id, "ENVIADO", admin),
        ]);

        assert.deepEqual(
          respuestas.map((r) => r.status).sort(),
          [200, 409, 409],
          JSON.stringify(respuestas.map((r) => r.body))
        );
        assert.equal(await estadoEnvioDe(pedido.id), "ENVIADO");
      }
    });

    it("pedido inexistente -> 404; body inválido -> 400", async () => {
      assertErrorEstandar(await cambiarEstado(2147483000, "CONFIRMADO"), 404, "PEDIDO_NO_ENCONTRADO");

      const cliente = await clienteConDireccion();
      const { pedido } = await pedidoReal(cliente);
      for (const body of [{}, { estado: "FOO" }, { estado: "confirmado" }, { estado: "CONFIRMADO", x: 1 }]) {
        const r = await api("PATCH", `/api/v1/pedidos/${pedido.id}/estado`, { token: admin.token, body });
        assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
      }
    });
  });
});
