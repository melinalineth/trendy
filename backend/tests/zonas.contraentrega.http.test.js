// Tests HTTP de PATCH /api/v1/zonas-cobertura/:id/contra-entrega (RF-037:
// "el método solo estará disponible cuando el administrador lo haya
// habilitado"; RN-006). Solo admin, mismo estilo que PATCH .../:id/estado.
//
// Uso: DATABASE_URL=mysql://... npm test
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  prisma,
  iniciarServidor,
  pedir,
  crearUsuario,
  crearZona,
  limpiar,
} = require("./helpers/entorno");

function assertErrorEstandar(respuesta, status, codigo) {
  assert.equal(respuesta.status, status, JSON.stringify(respuesta.body));
  assert.deepEqual(Object.keys(respuesta.body.error).sort(), ["codigo", "detalles", "mensaje"]);
  assert.equal(respuesta.body.error.codigo, codigo);
}

describe("Habilitar pago contra entrega por zona (RF-037)", () => {
  let servidor;
  let api;
  let admin;
  let cliente;
  let vendedor;

  const ruta = (id) => `/api/v1/zonas-cobertura/${id}/contra-entrega`;

  before(async () => {
    servidor = await iniciarServidor();
    api = (metodo, url, opciones) => pedir(servidor.baseUrl, metodo, url, opciones);
    admin = await crearUsuario("admin");
    cliente = await crearUsuario("cliente");
    vendedor = await crearUsuario("vendedor");
  });

  after(async () => {
    await servidor.cerrar();
    await limpiar();
  });

  it("sin token -> 401", async () => {
    const r = await api("PATCH", ruta(1), { body: { permiteContraEntrega: true } });
    assert.equal(r.status, 401);
  });

  it("como cliente o vendedor -> 403 ACCESO_DENEGADO", async () => {
    for (const usuario of [cliente, vendedor]) {
      const r = await api("PATCH", ruta(1), {
        token: usuario.token,
        body: { permiteContraEntrega: true },
      });
      assertErrorEstandar(r, 403, "ACCESO_DENEGADO");
    }
  });

  it("admin habilita y deshabilita: persiste y la respuesta devuelve el campo", async () => {
    const zona = await crearZona();

    let r = await api("PATCH", ruta(zona.id), {
      token: admin.token,
      body: { permiteContraEntrega: true },
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.id, zona.id);
    assert.equal(r.body.permiteContraEntrega, true);
    // Mismo formato que el resto de la API de zonas (presentarZona).
    assert.equal(r.body.tarifaActiva.costo, 12000);
    assert.equal(
      (await prisma.zonaCobertura.findUnique({ where: { id: zona.id } })).permiteContraEntrega,
      true
    );

    r = await api("PATCH", ruta(zona.id), {
      token: admin.token,
      body: { permiteContraEntrega: false },
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.permiteContraEntrega, false);
    assert.equal(
      (await prisma.zonaCobertura.findUnique({ where: { id: zona.id } })).permiteContraEntrega,
      false
    );
  });

  it("GET /api/v1/zonas-cobertura también expone permiteContraEntrega", async () => {
    const zona = await crearZona({ permiteContraEntrega: true });

    const r = await api("GET", "/api/v1/zonas-cobertura", { token: admin.token });
    assert.equal(r.status, 200);
    const encontrada = r.body.find((z) => z.id === zona.id);
    assert.equal(encontrada.permiteContraEntrega, true);
  });

  it("zona inexistente -> 404 ZONA_NO_ENCONTRADA", async () => {
    const r = await api("PATCH", ruta(2147483000), {
      token: admin.token,
      body: { permiteContraEntrega: true },
    });
    assertErrorEstandar(r, 404, "ZONA_NO_ENCONTRADA");
  });

  describe("body inválido -> 400 VALIDACION_FALLIDA con detalles, sin tocar la zona", () => {
    const bodies = [
      ["vacío", {}],
      ["string 'true'", { permiteContraEntrega: "true" }],
      ["número 1", { permiteContraEntrega: 1 }],
      ["null", { permiteContraEntrega: null }],
      // Estricto como pago.dto: un campo de más (p. ej. intentar cambiar el
      // estado en la misma request) se rechaza en vez de ignorarse.
      ["clave extra", { permiteContraEntrega: true, estado: "INACTIVO" }],
    ];

    for (const [nombre, body] of bodies) {
      it(nombre, async () => {
        const zona = await crearZona();

        const r = await api("PATCH", ruta(zona.id), { token: admin.token, body });
        assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
        assert.ok(Array.isArray(r.body.error.detalles) && r.body.error.detalles.length > 0);
        assert.equal(
          (await prisma.zonaCobertura.findUnique({ where: { id: zona.id } })).permiteContraEntrega,
          false
        );
      });
    }

    it("id no numérico -> 400", async () => {
      const r = await api("PATCH", ruta("abc"), {
        token: admin.token,
        body: { permiteContraEntrega: true },
      });
      assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
    });
  });
});
