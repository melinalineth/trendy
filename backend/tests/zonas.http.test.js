// Tests HTTP reales de la administración de zonas de cobertura y tarifas de
// envío (RF-026, DDS §3 MOD-05: GET/POST /api/v1/zonas-cobertura, solo admin;
// más PUT .../:id/tarifa y PATCH .../:id/estado para "modificar, activar y
// desactivar" de RF-026). Requieren una base MySQL migrada + con seed (ver
// tests/helpers/entorno.js); crean sus propios datos y los limpian.
//
// Uso: DATABASE_URL=mysql://... npm test
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  prisma,
  iniciarServidor,
  pedir,
  crearUsuario,
  crearVariante,
  crearDireccion,
  registrarZona,
  sufijo,
  limpiar,
} = require("./helpers/entorno");

// DDS §5.3: { error: { codigo, mensaje, detalles } }
function assertErrorEstandar(respuesta, status, codigo) {
  assert.equal(respuesta.status, status, JSON.stringify(respuesta.body));
  assert.deepEqual(Object.keys(respuesta.body.error).sort(), ["codigo", "detalles", "mensaje"]);
  assert.equal(respuesta.body.error.codigo, codigo);
}

describe("Zonas de cobertura y tarifas (RF-026)", () => {
  let servidor;
  let api;
  let admin;
  let cliente;
  let vendedor;

  // Body válido con ciudad/departamento únicos (hay unique por ambos).
  function bodyZona(costo = 12000, extra = {}) {
    const suf = sufijo();
    return {
      nombre: `Zona test ${suf}`,
      departamento: `Depto-${suf}`,
      ciudad: `Ciudad-${suf}`,
      tarifa: { costo },
      ...extra,
    };
  }

  // Crea una zona vía API admin y la registra para la limpieza.
  async function crearZonaApi(costo = 12000, extra = {}) {
    const body = bodyZona(costo, extra);
    const r = await api("POST", "/api/v1/zonas-cobertura", { token: admin.token, body });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    registrarZona(r.body.id);
    return { body, zona: r.body };
  }

  const tarifasDeZona = (zonaId) =>
    prisma.tarifaEnvio.findMany({ where: { zonaCoberturaId: zonaId }, orderBy: { id: "asc" } });

  before(async () => {
    servidor = await iniciarServidor();
    api = (metodo, ruta, opciones) => pedir(servidor.baseUrl, metodo, ruta, opciones);
    admin = await crearUsuario("admin");
    cliente = await crearUsuario("cliente");
    vendedor = await crearUsuario("vendedor");
  });

  after(async () => {
    await servidor.cerrar();
    await limpiar();
  });

  describe("autenticación y rol (solo admin)", () => {
    const endpoints = [
      ["GET", "/api/v1/zonas-cobertura", undefined],
      ["POST", "/api/v1/zonas-cobertura", { nombre: "X", departamento: "X", ciudad: "X", tarifa: { costo: 1 } }],
      ["PUT", "/api/v1/zonas-cobertura/1/tarifa", { costo: 1 }],
      ["PATCH", "/api/v1/zonas-cobertura/1/estado", { estado: "INACTIVO" }],
    ];

    for (const [metodo, ruta, body] of endpoints) {
      it(`${metodo} ${ruta} sin token -> 401`, async () => {
        const r = await api(metodo, ruta, { body });
        assert.equal(r.status, 401);
      });

      it(`${metodo} ${ruta} como cliente -> 403`, async () => {
        const r = await api(metodo, ruta, { token: cliente.token, body });
        assertErrorEstandar(r, 403, "ACCESO_DENEGADO");
      });

      it(`${metodo} ${ruta} como vendedor -> 403`, async () => {
        const r = await api(metodo, ruta, { token: vendedor.token, body });
        assertErrorEstandar(r, 403, "ACCESO_DENEGADO");
      });
    }
  });

  describe("POST /api/v1/zonas-cobertura", () => {
    it("crea la zona con su tarifa inicial -> 201", async () => {
      const body = bodyZona(8500.5);
      const r = await api("POST", "/api/v1/zonas-cobertura", { token: admin.token, body });

      assert.equal(r.status, 201, JSON.stringify(r.body));
      registrarZona(r.body.id);

      assert.equal(typeof r.body.id, "number");
      assert.equal(r.body.nombre, body.nombre);
      assert.equal(r.body.departamento, body.departamento);
      assert.equal(r.body.ciudad, body.ciudad);
      assert.equal(r.body.estado, "ACTIVO");
      assert.equal(typeof r.body.tarifaActiva.id, "number");
      assert.equal(r.body.tarifaActiva.costo, 8500.5);
      assert.equal(r.body.tarifaActiva.estado, "ACTIVO");

      const tarifas = await tarifasDeZona(r.body.id);
      assert.equal(tarifas.length, 1);
      assert.equal(tarifas[0].estado, "ACTIVO");
      assert.equal(Number(tarifas[0].costo), 8500.5);
    });

    it("recorta los espacios de nombre, departamento y ciudad", async () => {
      const suf = sufijo();
      const r = await api("POST", "/api/v1/zonas-cobertura", {
        token: admin.token,
        body: {
          nombre: `  Zona ${suf}  `,
          departamento: `  Depto-${suf} `,
          ciudad: ` Ciudad-${suf}  `,
          tarifa: { costo: 5000 },
        },
      });

      assert.equal(r.status, 201, JSON.stringify(r.body));
      registrarZona(r.body.id);
      assert.equal(r.body.nombre, `Zona ${suf}`);
      assert.equal(r.body.departamento, `Depto-${suf}`);
      assert.equal(r.body.ciudad, `Ciudad-${suf}`);
    });

    it("zona duplicada (mismo departamento y ciudad) -> 409 sin crear nada", async () => {
      const { body, zona } = await crearZonaApi(10000);

      // La collation de MySQL no distingue mayúsculas: también es duplicada.
      const r = await api("POST", "/api/v1/zonas-cobertura", {
        token: admin.token,
        body: {
          ...bodyZona(9000),
          departamento: body.departamento.toUpperCase(),
          ciudad: body.ciudad.toLowerCase(),
        },
      });

      assertErrorEstandar(r, 409, "ZONA_DUPLICADA");
      assert.equal((await tarifasDeZona(zona.id)).length, 1);
    });

    const invalidos = [
      ["sin body", undefined],
      ["body vacío", {}],
      ["nombre vacío", { ...bodyZona(), nombre: "   " }],
      ["nombre ausente", (() => { const b = bodyZona(); delete b.nombre; return b; })()],
      ["nombre demasiado largo", { ...bodyZona(), nombre: "x".repeat(101) }],
      ["departamento vacío", { ...bodyZona(), departamento: "  " }],
      ["departamento no string", { ...bodyZona(), departamento: 123 }],
      ["ciudad ausente", (() => { const b = bodyZona(); delete b.ciudad; return b; })()],
      ["tarifa ausente", (() => { const b = bodyZona(); delete b.tarifa; return b; })()],
      ["costo ausente", { ...bodyZona(), tarifa: {} }],
      ["costo null", bodyZona(null)],
      ["costo negativo", bodyZona(-5)],
      ["costo cero", bodyZona(0)],
      ["costo texto", bodyZona("abc")],
      ["costo numérico como string", bodyZona("15000")],
      ["costo con más de 2 decimales", bodyZona(1.005)],
      // Un valor positivo pero minúsculo pasaba la tolerancia de decimales y
      // MySQL lo guardaba como DECIMAL(10,2) = 0.00 (tarifa en cero).
      ["costo positivo que se redondea a 0.00 (1e-8)", bodyZona(1e-8)],
      ["costo por debajo del mínimo (0.004)", bodyZona(0.004)],
      ["costo sobre el tope", bodyZona(1000000.01)],
      ["costo infinito (JSON lo serializa como null)", bodyZona(Infinity)],
    ];

    for (const [descripcion, body] of invalidos) {
      it(`${descripcion} -> 400`, async () => {
        const r = await api("POST", "/api/v1/zonas-cobertura", { token: admin.token, body });
        assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
        assert.ok(Array.isArray(r.body.error.detalles) && r.body.error.detalles.length > 0);
      });
    }

    it("un body inválido no crea ninguna zona", async () => {
      const body = { ...bodyZona(-1) };
      const r = await api("POST", "/api/v1/zonas-cobertura", { token: admin.token, body });
      assert.equal(r.status, 400);

      const enDb = await prisma.zonaCobertura.findFirst({ where: { ciudad: body.ciudad } });
      assert.equal(enDb, null);
    });
  });

  describe("GET /api/v1/zonas-cobertura", () => {
    it("lista las zonas con su tarifa activa", async () => {
      const { zona } = await crearZonaApi(7777);
      const inactiva = await crearZonaApi(3000);
      await api("PATCH", `/api/v1/zonas-cobertura/${inactiva.zona.id}/estado`, {
        token: admin.token,
        body: { estado: "INACTIVO" },
      });

      const r = await api("GET", "/api/v1/zonas-cobertura", { token: admin.token });

      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body));

      const encontrada = r.body.find((z) => z.id === zona.id);
      assert.ok(encontrada, "la zona creada aparece en el listado");
      assert.equal(encontrada.estado, "ACTIVO");
      assert.equal(encontrada.tarifaActiva.costo, 7777);
      assert.equal(encontrada.tarifaActiva.estado, "ACTIVO");

      // El admin ve también las zonas desactivadas (para poder reactivarlas).
      const apagada = r.body.find((z) => z.id === inactiva.zona.id);
      assert.ok(apagada, "las zonas inactivas también se listan");
      assert.equal(apagada.estado, "INACTIVO");
    });

    it("tras cambiar la tarifa, el listado muestra solo la nueva como activa", async () => {
      const { zona } = await crearZonaApi(1000);
      await api("PUT", `/api/v1/zonas-cobertura/${zona.id}/tarifa`, {
        token: admin.token,
        body: { costo: 2000 },
      });

      const r = await api("GET", "/api/v1/zonas-cobertura", { token: admin.token });
      const encontrada = r.body.find((z) => z.id === zona.id);
      assert.equal(encontrada.tarifaActiva.costo, 2000);
    });
  });

  describe("PUT /api/v1/zonas-cobertura/:id/tarifa", () => {
    it("deja exactamente 1 tarifa activa y conserva las anteriores como INACTIVO", async () => {
      const { zona } = await crearZonaApi(1000);

      const r1 = await api("PUT", `/api/v1/zonas-cobertura/${zona.id}/tarifa`, {
        token: admin.token,
        body: { costo: 2000.25 },
      });
      assert.equal(r1.status, 200, JSON.stringify(r1.body));
      assert.equal(r1.body.id, zona.id);
      assert.equal(r1.body.tarifaActiva.costo, 2000.25);
      assert.notEqual(r1.body.tarifaActiva.id, zona.tarifaActiva.id);

      const r2 = await api("PUT", `/api/v1/zonas-cobertura/${zona.id}/tarifa`, {
        token: admin.token,
        body: { costo: 3000 },
      });
      assert.equal(r2.status, 200);

      const tarifas = await tarifasDeZona(zona.id);
      assert.equal(tarifas.length, 3, "se conserva el historial (no se borra nada)");
      assert.deepEqual(tarifas.map((t) => [Number(t.costo), t.estado]), [
        [1000, "INACTIVO"],
        [2000.25, "INACTIVO"],
        [3000, "ACTIVO"],
      ]);
    });

    it("cambios concurrentes siguen dejando una sola tarifa activa", async () => {
      const { zona } = await crearZonaApi(1000);

      const respuestas = await Promise.all(
        [1100, 1200, 1300, 1400, 1500].map((costo) =>
          api("PUT", `/api/v1/zonas-cobertura/${zona.id}/tarifa`, {
            token: admin.token,
            body: { costo },
          })
        )
      );
      for (const r of respuestas) assert.equal(r.status, 200, JSON.stringify(r.body));

      const tarifas = await tarifasDeZona(zona.id);
      assert.equal(tarifas.length, 6);
      assert.equal(tarifas.filter((t) => t.estado === "ACTIVO").length, 1);
    });

    it("zona inexistente -> 404", async () => {
      const r = await api("PUT", "/api/v1/zonas-cobertura/2000000000/tarifa", {
        token: admin.token,
        body: { costo: 1000 },
      });
      assertErrorEstandar(r, 404, "ZONA_NO_ENCONTRADA");
    });

    for (const [descripcion, ruta] of [
      ["id no numérico", "abc"],
      ["id cero", "0"],
      ["id negativo", "-3"],
      ["id decimal", "1.5"],
      ["id fuera de rango", "99999999999"],
    ]) {
      it(`${descripcion} -> 400`, async () => {
        const r = await api("PUT", `/api/v1/zonas-cobertura/${ruta}/tarifa`, {
          token: admin.token,
          body: { costo: 1000 },
        });
        assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
      });
    }

    for (const [descripcion, body] of [
      ["sin body", undefined],
      ["body vacío", {}],
      ["costo negativo", { costo: -1 }],
      ["costo cero", { costo: 0 }],
      ["costo texto", { costo: "abc" }],
      ["costo con 3 decimales", { costo: 10.123 }],
      ["costo sobre el tope", { costo: 5000000 }],
    ]) {
      it(`${descripcion} -> 400 y no toca las tarifas`, async () => {
        const { zona } = await crearZonaApi(1000);
        const r = await api("PUT", `/api/v1/zonas-cobertura/${zona.id}/tarifa`, {
          token: admin.token,
          body,
        });
        assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");

        const tarifas = await tarifasDeZona(zona.id);
        assert.equal(tarifas.length, 1);
        assert.equal(tarifas[0].estado, "ACTIVO");
      });
    }
  });

  describe("PATCH /api/v1/zonas-cobertura/:id/estado", () => {
    it("desactiva y reactiva la zona sin tocar sus tarifas", async () => {
      const { zona } = await crearZonaApi(4000);

      const apagar = await api("PATCH", `/api/v1/zonas-cobertura/${zona.id}/estado`, {
        token: admin.token,
        body: { estado: "INACTIVO" },
      });
      assert.equal(apagar.status, 200, JSON.stringify(apagar.body));
      assert.equal(apagar.body.id, zona.id);
      assert.equal(apagar.body.estado, "INACTIVO");
      assert.equal(apagar.body.tarifaActiva.costo, 4000);

      const enDb = await prisma.zonaCobertura.findUnique({ where: { id: zona.id } });
      assert.equal(enDb.estado, "INACTIVO");
      assert.equal((await tarifasDeZona(zona.id))[0].estado, "ACTIVO");

      const prender = await api("PATCH", `/api/v1/zonas-cobertura/${zona.id}/estado`, {
        token: admin.token,
        body: { estado: "ACTIVO" },
      });
      assert.equal(prender.status, 200);
      assert.equal(prender.body.estado, "ACTIVO");
    });

    it("zona inexistente -> 404", async () => {
      const r = await api("PATCH", "/api/v1/zonas-cobertura/2000000000/estado", {
        token: admin.token,
        body: { estado: "INACTIVO" },
      });
      assertErrorEstandar(r, 404, "ZONA_NO_ENCONTRADA");
    });

    for (const [descripcion, ruta] of [
      ["id no numérico", "abc"],
      ["id cero", "0"],
      ["id negativo", "-3"],
    ]) {
      it(`${descripcion} -> 400`, async () => {
        const r = await api("PATCH", `/api/v1/zonas-cobertura/${ruta}/estado`, {
          token: admin.token,
          body: { estado: "INACTIVO" },
        });
        assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
      });
    }

    for (const [descripcion, body] of [
      ["sin body", undefined],
      ["body vacío", {}],
      ["estado desconocido", { estado: "BORRADO" }],
      ["estado en minúsculas", { estado: "inactivo" }],
      ["estado no string", { estado: true }],
    ]) {
      it(`${descripcion} -> 400`, async () => {
        const { zona } = await crearZonaApi(1000);
        const r = await api("PATCH", `/api/v1/zonas-cobertura/${zona.id}/estado`, {
          token: admin.token,
          body,
        });
        assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");

        const enDb = await prisma.zonaCobertura.findUnique({ where: { id: zona.id } });
        assert.equal(enDb.estado, "ACTIVO");
      });
    }
  });

  describe("integración con envío y resumen del carrito", () => {
    it("una zona creada por el admin habilita el cálculo de envío del cliente", async () => {
      const { body, zona } = await crearZonaApi(9500);
      const cliente2 = await crearUsuario("cliente");
      const direccion = await crearDireccion(cliente2.id, {
        ciudad: body.ciudad,
        departamento: body.departamento,
      });

      const r = await api("GET", `/api/v1/envios/tarifa?direccionId=${direccion.id}`, {
        token: cliente2.token,
      });

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.costo, 9500);
      assert.equal(r.body.zonaId, zona.id);
      assert.equal(r.body.tarifaId, zona.tarifaActiva.id);
    });

    it("el resumen del carrito refleja el costo de envío de la zona", async () => {
      const { body } = await crearZonaApi(6200);
      const cliente2 = await crearUsuario("cliente");
      const variante = await crearVariante({ precio: "10000.00", stock: 10 });
      await api("POST", "/api/v1/carrito/items", {
        token: cliente2.token,
        body: { varianteId: variante.id, cantidad: 2 },
      });
      const direccion = await crearDireccion(cliente2.id, {
        ciudad: body.ciudad,
        departamento: body.departamento,
      });

      const r = await api("GET", `/api/v1/carrito/resumen?direccionId=${direccion.id}`, {
        token: cliente2.token,
      });

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.subtotal, 20000);
      assert.equal(r.body.costoEnvio, 6200);
      assert.equal(r.body.total, 26200);
    });

    it("cambiar la tarifa impacta el envío; desactivar la zona devuelve 409 SIN_COBERTURA", async () => {
      const { body, zona } = await crearZonaApi(5000);
      const cliente2 = await crearUsuario("cliente");
      const direccion = await crearDireccion(cliente2.id, {
        ciudad: body.ciudad,
        departamento: body.departamento,
      });
      const consultar = (ruta) => api("GET", ruta, { token: cliente2.token });
      const rutaTarifa = `/api/v1/envios/tarifa?direccionId=${direccion.id}`;
      const rutaResumen = `/api/v1/carrito/resumen?direccionId=${direccion.id}`;

      await api("PUT", `/api/v1/zonas-cobertura/${zona.id}/tarifa`, {
        token: admin.token,
        body: { costo: 7300 },
      });
      const nueva = await consultar(rutaTarifa);
      assert.equal(nueva.status, 200);
      assert.equal(nueva.body.costo, 7300);

      await api("PATCH", `/api/v1/zonas-cobertura/${zona.id}/estado`, {
        token: admin.token,
        body: { estado: "INACTIVO" },
      });
      assertErrorEstandar(await consultar(rutaTarifa), 409, "SIN_COBERTURA");
      assertErrorEstandar(await consultar(rutaResumen), 409, "SIN_COBERTURA");

      await api("PATCH", `/api/v1/zonas-cobertura/${zona.id}/estado`, {
        token: admin.token,
        body: { estado: "ACTIVO" },
      });
      const reactivada = await consultar(rutaTarifa);
      assert.equal(reactivada.status, 200);
      assert.equal(reactivada.body.costo, 7300);
    });
  });
});
