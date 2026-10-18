// Tests HTTP de GET /api/v1/ventas (RF-042). Contrato: docs/diseno/ventas-api.md.
//
//   GET /api/v1/ventas   admin, vendedor (los dos ven TODAS las ventas y los
//                        totales en v1.0); cliente -> 403; sin token -> 401.
//
// Aislamiento: la base de tests puede traer ventas de otros archivos. Todas las
// ventas de este archivo se registran en 2035 (las consultas de "sin ventas"
// usan 2039) y cada consulta acota su período con `desde`/`hasta`. Los conteos
// y totales son EXACTOS, por eso el `before` borra primero las ventas de 2035
// que haya dejado una corrida cortada (solo ese rango de fechas).
//
// Requiere correr con `--test-concurrency=1` (como el script `test` del
// proyecto): comparte la base con los demás archivos de test.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  prisma,
  iniciarServidor,
  pedir,
  crearUsuario,
  crearVariante,
  crearDireccion,
  crearVenta,
  limpiar,
} = require("./helpers/entorno");

const bogota = (texto) => new Date(`${texto}-05:00`);

function assertErrorEstandar(respuesta, status, codigo) {
  assert.equal(respuesta.status, status, JSON.stringify(respuesta.body));
  assert.deepEqual(Object.keys(respuesta.body.error).sort(), ["codigo", "detalles", "mensaje"]);
  assert.equal(respuesta.body.error.codigo, codigo);
}

// Todas las claves de un JSON, a cualquier profundidad.
function clavesDe(valor, acumulado = new Set()) {
  if (Array.isArray(valor)) {
    valor.forEach((v) => clavesDe(v, acumulado));
  } else if (valor && typeof valor === "object") {
    for (const [clave, v] of Object.entries(valor)) {
      acumulado.add(clave);
      clavesDe(v, acumulado);
    }
  }
  return acumulado;
}

describe("GET /api/v1/ventas (RF-042)", () => {
  let servidor;
  let api;
  let admin;
  let vendedor;
  let cliente;
  let otroCliente;
  let direccion;
  let direccionOtro;
  let variante;

  const listar = (usuario, query = "") =>
    api("GET", `/api/v1/ventas${query}`, { token: usuario?.token });

  const nueva = (extra = {}) =>
    crearVenta({
      usuarioId: cliente.id,
      direccionId: direccion.id,
      lineas: [{ variante, cantidad: 2, precioUnitario: "12345.00" }],
      costoEnvio: 8000,
      ...extra,
    });

  before(async () => {
    await prisma.venta.deleteMany({
      where: {
        registradaEn: {
          gte: new Date("2035-01-01T00:00:00.000Z"),
          lt: new Date("2036-01-01T00:00:00.000Z"),
        },
      },
    });
    servidor = await iniciarServidor();
    api = (metodo, ruta, opciones) => pedir(servidor.baseUrl, metodo, ruta, opciones);
    admin = await crearUsuario("admin");
    vendedor = await crearUsuario("vendedor");
    cliente = await crearUsuario("cliente");
    otroCliente = await crearUsuario("cliente");
    direccion = await crearDireccion(cliente.id);
    direccionOtro = await crearDireccion(otroCliente.id);
    variante = await crearVariante({ precio: "12345.00", stock: 100 });
  });

  after(async () => {
    await servidor.cerrar();
    await limpiar();
  });

  describe("autenticación y roles", () => {
    // El 401 lo responde el middleware compartido auth.js, que en todo el
    // proyecto devuelve { error: "<texto>" } (no el formato estándar de tres
    // claves). Acá solo se verifica el status y que haya un mensaje.
    it("sin token responde 401 con un mensaje de error", async () => {
      const r = await listar(undefined, "?desde=2035-01-01&hasta=2035-01-31");

      assert.equal(r.status, 401);
      assert.equal(typeof r.body.error, "string");
      assert.ok(r.body.error.length > 0);
    });

    it("un token inválido responde 401", async () => {
      const r = await listar({ token: "no-es-un-jwt" });

      assert.equal(r.status, 401);
    });

    it("un cliente responde 403 ACCESO_DENEGADO, también con filtros inválidos", async () => {
      assertErrorEstandar(await listar(cliente), 403, "ACCESO_DENEGADO");
      assertErrorEstandar(await listar(cliente, "?pagina=0&foo=1"), 403, "ACCESO_DENEGADO");
    });

    it("admin y vendedor responden 200", async () => {
      assert.equal((await listar(admin, "?desde=2035-01-01&hasta=2035-01-31")).status, 200);
      assert.equal((await listar(vendedor, "?desde=2035-01-01&hasta=2035-01-31")).status, 200);
    });
  });

  describe("contenido", () => {
    let ventaDelCliente;
    let ventaDelOtro;
    let ventaAnulada;

    before(async () => {
      ventaDelCliente = (
        await nueva({ registradaEn: bogota("2035-03-10T10:00:00.000"), responsableId: admin.id })
      ).venta;
      ventaDelOtro = (
        await crearVenta({
          usuarioId: otroCliente.id,
          direccionId: direccionOtro.id,
          lineas: [{ variante, cantidad: 1, precioUnitario: "12345.00" }],
          costoEnvio: 0,
          metodoPago: "CONTRA_ENTREGA",
          registradaEn: bogota("2035-03-11T10:00:00.000"),
        })
      ).venta;
      ventaAnulada = (
        await nueva({
          registradaEn: bogota("2035-03-12T10:00:00.000"),
          estado: "ANULADA",
          anuladaEn: new Date("2035-03-12T18:30:00.000Z"),
        })
      ).venta;
    });

    const marzo = "?desde=2035-03-01&hasta=2035-03-31";

    it("admin y vendedor ven LAS MISMAS ventas y totales (todas, de cualquier cliente)", async () => {
      const deAdmin = await listar(admin, marzo);
      const deVendedor = await listar(vendedor, marzo);

      assert.equal(deAdmin.status, 200, JSON.stringify(deAdmin.body));
      assert.deepEqual(deVendedor.body, deAdmin.body);
      assert.deepEqual(
        deAdmin.body.ventas.map((v) => v.id),
        [ventaAnulada.id, ventaDelOtro.id, ventaDelCliente.id]
      );
      assert.deepEqual(deAdmin.body.totales, {
        registradas: { cantidad: 2, total: 32690 + 12345 },
        anuladas: { cantidad: 1, total: 32690 },
      });
    });

    it("la respuesta respeta el contrato (claves y tipos) y trae las líneas históricas", async () => {
      const r = await listar(admin, "?desde=2035-03-10&hasta=2035-03-10");

      assert.deepEqual(Object.keys(r.body), ["ventas", "paginacion", "totales"]);
      const [v] = r.body.ventas;
      assert.equal(v.id, ventaDelCliente.id);
      assert.equal(typeof v.numeroPedido, "string");
      assert.equal(v.estadoPedido, "CONFIRMADO");
      assert.equal(v.fecha, "2035-03-10T15:00:00.000Z");
      assert.deepEqual(v.cliente, { id: cliente.id, nombre: "Test cliente" });
      assert.deepEqual(v.responsable, { id: admin.id, nombre: "Test admin" });
      assert.equal(v.anuladaPor, null, "una venta REGISTRADA no tiene quién la anuló");
      assert.strictEqual(v.subtotal, 24690);
      assert.strictEqual(v.costoEnvio, 8000);
      assert.strictEqual(v.total, 32690);
      assert.equal(v.productos.length, 1);
      assert.strictEqual(v.productos[0].precioUnitario, 12345);
      assert.strictEqual(v.productos[0].cantidad, 2);
      assert.strictEqual(v.productos[0].subtotal, 24690);
      assert.equal(v.productos[0].sku, variante.sku);
    });

    it("una venta sin responsable (webhook) trae responsable: null", async () => {
      const r = await listar(vendedor, "?desde=2035-03-11&hasta=2035-03-11");

      assert.equal(r.body.ventas[0].id, ventaDelOtro.id);
      assert.equal(r.body.ventas[0].responsable, null);
      assert.equal(r.body.ventas[0].metodoPago, "CONTRA_ENTREGA");
    });

    it("una venta ANULADA trae estado y anuladaEn; estado=ANULADA filtra el listado pero no los totales", async () => {
      const r = await listar(admin, `${marzo}&estado=ANULADA`);

      assert.deepEqual(
        r.body.ventas.map((v) => [v.id, v.estado, v.anuladaEn]),
        [[ventaAnulada.id, "ANULADA", "2035-03-12T18:30:00.000Z"]]
      );
      assert.equal(r.body.paginacion.total, 1);
      // Las dos tarjetas siguen mostrando el consolidado del período.
      assert.deepEqual(r.body.totales, {
        registradas: { cantidad: 2, total: 45035 },
        anuladas: { cantidad: 1, total: 32690 },
      });

      const registradas = await listar(admin, `${marzo}&estado=REGISTRADA`);
      assert.equal(registradas.body.ventas.length, 2);
      assert.ok(registradas.body.ventas.every((v) => v.anuladaEn === null));
      assert.deepEqual(registradas.body.totales, r.body.totales);
    });

    it("no filtra correo, passwordHash ni email en ningún nivel", async () => {
      const r = await listar(admin, marzo);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(r.body.ventas.length > 0);
      const claves = clavesDe(r.body);

      for (const prohibida of ["correo", "passwordHash", "email", "rolId", "password"]) {
        assert.equal(claves.has(prohibida), false, `no debe aparecer la clave ${prohibida}`);
      }
      assert.doesNotMatch(JSON.stringify(r.body), /@trendy\.test|no-se-usa-en-estos-tests/);
    });
  });

  // `anuladaPor` es quien ANULÓ la venta (admin/vendedor que canceló el pedido
  // contra entrega); `responsable` sigue siendo quien la REGISTRÓ.
  describe("quién anuló la venta (anuladaPor)", () => {
    let ventaDelPedidoCancelado;
    let ventaLegada;

    before(async () => {
      // Contra entrega confirmado por el admin y cancelado por el VENDEDOR por la
      // API real: la anulación la escribe el flujo, no el test.
      const { venta, pedido } = await nueva({
        registradaEn: bogota("2035-04-10T10:00:00.000"),
        metodoPago: "CONTRA_ENTREGA",
        estadoPedido: "CONFIRMADO",
        responsableId: admin.id,
      });
      ventaDelPedidoCancelado = venta;
      const cancelacion = await api("PATCH", `/api/v1/pedidos/${pedido.id}/cancelar`, {
        token: vendedor.token,
      });
      assert.equal(cancelacion.status, 200, JSON.stringify(cancelacion.body));

      // ANULADA legada: anulada antes de que existiera la columna, sin quién.
      ventaLegada = (
        await nueva({
          registradaEn: bogota("2035-04-11T10:00:00.000"),
          estado: "ANULADA",
          responsableId: admin.id,
        })
      ).venta;
      // REGISTRADA: nadie la anuló.
      await nueva({ registradaEn: bogota("2035-04-12T10:00:00.000"), responsableId: admin.id });
    });

    const dia = (usuario, d) => listar(usuario, `?desde=2035-04-${d}&hasta=2035-04-${d}`);

    it("una venta anulada al cancelar el pedido trae anuladaPor = el vendedor, y responsable sigue siendo el admin", async () => {
      const r = await dia(admin, "10");

      assert.equal(r.status, 200, JSON.stringify(r.body));
      const [v] = r.body.ventas;
      assert.equal(v.id, ventaDelPedidoCancelado.id);
      assert.equal(v.estado, "ANULADA");
      assert.deepEqual(v.anuladaPor, { id: vendedor.id, nombre: "Test vendedor" });
      assert.deepEqual(Object.keys(v.anuladaPor).sort(), ["id", "nombre"]);
      assert.deepEqual(v.responsable, { id: admin.id, nombre: "Test admin" });
    });

    it("una venta ANULADA legada (sin quién la anuló) trae anuladaPor: null", async () => {
      const [v] = (await dia(admin, "11")).body.ventas;

      assert.equal(v.id, ventaLegada.id);
      assert.equal(v.estado, "ANULADA");
      assert.equal(v.anuladaPor, null);
    });

    it("una venta REGISTRADA trae anuladaPor: null; el vendedor ve lo mismo que el admin", async () => {
      const [v] = (await dia(admin, "12")).body.ventas;

      assert.equal(v.estado, "REGISTRADA");
      assert.equal(v.anuladaPor, null);
      assert.deepEqual((await dia(vendedor, "10")).body, (await dia(admin, "10")).body);
    });

    it("anuladaPor no filtra correo ni otros datos de la persona", async () => {
      const r = await listar(admin, "?desde=2035-04-01&hasta=2035-04-30");
      const anulada = r.body.ventas.find((v) => v.id === ventaDelPedidoCancelado.id);

      assert.deepEqual(Object.keys(anulada.anuladaPor), ["id", "nombre"]);
      assert.doesNotMatch(JSON.stringify(r.body), /@trendy\.test|passwordHash|correo/);
    });
  });

  describe("fechas en hora de Bogotá", () => {
    before(async () => {
      await nueva({ registradaEn: bogota("2035-10-31T23:30:00.000") });
      await nueva({ registradaEn: bogota("2035-11-01T00:10:00.000") });
    });

    it("la venta de las 23:30 de Bogotá del 31/10 entra con hasta=31/10 y no con hasta=30/10", async () => {
      const con = await listar(admin, "?desde=2035-10-01&hasta=2035-10-31");
      const sin = await listar(admin, "?desde=2035-10-01&hasta=2035-10-30");

      assert.equal(con.body.ventas.length, 1);
      assert.equal(con.body.ventas[0].fecha, "2035-11-01T04:30:00.000Z");
      assert.equal(sin.body.ventas.length, 0);
    });

    it("la venta de las 00:10 de Bogotá del 01/11 no entra con hasta=31/10", async () => {
      const r = await listar(admin, "?desde=2035-11-01&hasta=2035-11-01");

      assert.equal(r.body.ventas.length, 1);
      assert.equal(r.body.ventas[0].fecha, "2035-11-01T05:10:00.000Z");
      assert.equal(r.body.totales.registradas.cantidad, 1);
    });
  });

  describe("orden y paginación", () => {
    before(async () => {
      for (let dia = 1; dia <= 5; dia += 1) {
        await nueva({ registradaEn: bogota(`2035-06-0${dia}T10:00:00.000`) });
      }
    });

    const junio = "desde=2035-06-01&hasta=2035-06-30";

    it("limite=2 con 5 ventas: 3 páginas, sin repetir ni saltear, de la más reciente a la más antigua", async () => {
      const p1 = await listar(vendedor, `?${junio}&limite=2`);
      const p2 = await listar(vendedor, `?${junio}&limite=2&pagina=2`);
      const p3 = await listar(vendedor, `?${junio}&limite=2&pagina=3`);

      assert.deepEqual(p1.body.paginacion, { pagina: 1, limite: 2, total: 5, totalPaginas: 3 });
      assert.deepEqual(p3.body.paginacion, { pagina: 3, limite: 2, total: 5, totalPaginas: 3 });
      assert.deepEqual(
        [p1, p2, p3].map((p) => p.body.ventas.length),
        [2, 2, 1]
      );

      const todas = [...p1.body.ventas, ...p2.body.ventas, ...p3.body.ventas];
      assert.equal(new Set(todas.map((v) => v.id)).size, 5);
      const fechas = todas.map((v) => v.fecha);
      assert.deepEqual(fechas, [...fechas].sort().reverse());
      // Los totales son del período completo en cada página.
      assert.equal(p2.body.totales.registradas.cantidad, 5);
    });

    it("sin limite usa 50 y sin pagina usa la 1", async () => {
      const r = await listar(admin, `?${junio}`);

      assert.equal(r.body.paginacion.pagina, 1);
      assert.equal(r.body.paginacion.limite, 50);
      assert.equal(r.body.ventas.length, 5);
    });

    it("sin ventas en el período: 200 con lista vacía, una página y totales en cero", async () => {
      const r = await listar(admin, "?desde=2039-01-01&hasta=2039-01-31");

      assert.equal(r.status, 200);
      assert.deepEqual(r.body, {
        ventas: [],
        paginacion: { pagina: 1, limite: 50, total: 0, totalPaginas: 1 },
        totales: {
          registradas: { cantidad: 0, total: 0 },
          anuladas: { cantidad: 0, total: 0 },
        },
      });
    });
  });

  describe("filtros inválidos -> 400 VALIDACION_FALLIDA", () => {
    const casos = [
      ["desde con formato inválido", "?desde=31-12-2035", /desde/],
      ["hasta con fecha inexistente", "?hasta=2035-02-30", /hasta/],
      ["hasta con año fuera de 2000..2100", "?hasta=9999-12-31", /hasta.*2000.*2100/],
      ["desde con año de tres cifras", "?desde=0100-01-01", /desde.*2000.*2100/],
      ["desde posterior a hasta", "?desde=2035-05-02&hasta=2035-05-01", /desde no puede ser posterior/],
      ["rango mayor a 366 días", "?desde=2035-01-01&hasta=2036-01-02", /366/],
      ["estado desconocido", "?estado=PENDIENTE", /estado/],
      ["estado en minúsculas", "?estado=anulada", /estado/],
      ["pagina 0", "?pagina=0", /pagina/],
      ["pagina no entera", "?pagina=1.5", /pagina/],
      ["limite 0", "?limite=0", /limite/],
      ["limite 101", "?limite=101", /limite/],
      ["limite no numérico", "?limite=muchos", /limite/],
      ["parámetro desconocido", "?usuarioId=3", /usuarioId/],
      ["valor vacío", "?desde=", /desde/],
      ["estado vacío", "?estado=", /estado/],
      ["parámetro repetido", "?pagina=1&pagina=2", /pagina no puede repetirse/],
      ["sintaxis anidada de la query", "?estado[a]=x", /estado\[a\]/],
    ];

    for (const [nombre, query, patron] of casos) {
      it(`${nombre} (${query})`, async () => {
        const r = await listar(admin, query);

        assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
        assert.ok(Array.isArray(r.body.error.detalles) && r.body.error.detalles.length > 0);
        assert.ok(r.body.error.detalles.every((d) => typeof d === "string"));
        assert.ok(
          r.body.error.detalles.every((d) => !d.endsWith(".")),
          JSON.stringify(r.body.error.detalles)
        );
        assert.match(r.body.error.detalles.join(" | "), patron);
        assert.equal(typeof r.body.error.mensaje, "string");
      });
    }

    it("el vendedor recibe el mismo 400 que el admin", async () => {
      const r = await listar(vendedor, "?limite=1000");

      assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
    });

    it("informa todos los problemas juntos", async () => {
      const r = await listar(admin, "?desde=mal&estado=x&pagina=0&limite=500&otro=1");

      assert.ok(r.body.error.detalles.length >= 5, JSON.stringify(r.body.error.detalles));
    });
  });
});
