// Tests HTTP reales del cálculo de tarifa de envío (DDS §3 MOD-05,
// GET /api/v1/envios/tarifa?direccionId=). Requieren una base MySQL migrada +
// con seed (ver tests/helpers/entorno.js); crean sus propios datos y los
// limpian.
//
// Uso: DATABASE_URL=mysql://... npm test
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  iniciarServidor,
  pedir,
  crearUsuario,
  crearZona,
  crearDireccion,
  limpiar,
} = require("./helpers/entorno");

// DDS §5.3: { error: { codigo, mensaje, detalles } }
function assertErrorEstandar(respuesta, status, codigo) {
  assert.equal(respuesta.status, status, JSON.stringify(respuesta.body));
  assert.deepEqual(Object.keys(respuesta.body.error).sort(), ["codigo", "detalles", "mensaje"]);
  assert.equal(respuesta.body.error.codigo, codigo);
}

describe("GET /api/v1/envios/tarifa", () => {
  let servidor;
  let api;

  before(async () => {
    servidor = await iniciarServidor();
    api = (metodo, ruta, opciones) => pedir(servidor.baseUrl, metodo, ruta, opciones);
  });

  after(async () => {
    await servidor.cerrar();
    await limpiar();
  });

  it("sin token -> 401", async () => {
    const r = await api("GET", "/api/v1/envios/tarifa?direccionId=1");
    assert.equal(r.status, 401);
  });

  it("un vendedor no calcula envíos de compra -> 403", async () => {
    const vendedor = await crearUsuario("vendedor");
    const r = await api("GET", "/api/v1/envios/tarifa?direccionId=1", { token: vendedor.token });
    assertErrorEstandar(r, 403, "ACCESO_DENEGADO");
  });

  it("dirección en zona cubierta -> 200 con el costo de la tarifa activa", async () => {
    const cliente = await crearUsuario();
    const zona = await crearZona({ costo: "8500.50" });
    const direccion = await crearDireccion(cliente.id, {
      ciudad: zona.ciudad,
      departamento: zona.departamento,
    });

    const r = await api("GET", `/api/v1/envios/tarifa?direccionId=${direccion.id}`, {
      token: cliente.token,
    });

    assert.equal(r.status, 200);
    assert.equal(r.body.costo, 8500.5);
    assert.equal(r.body.zonaId, zona.id);
    assert.equal(typeof r.body.tarifaId, "number");
  });

  it("la cobertura no distingue mayúsculas/minúsculas (collation MySQL)", async () => {
    const cliente = await crearUsuario();
    const zona = await crearZona();
    const direccion = await crearDireccion(cliente.id, {
      ciudad: zona.ciudad.toUpperCase(),
      departamento: zona.departamento.toLowerCase(),
    });

    const r = await api("GET", `/api/v1/envios/tarifa?direccionId=${direccion.id}`, {
      token: cliente.token,
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.zonaId, zona.id);
  });

  it("dirección sin cobertura -> 409 SIN_COBERTURA", async () => {
    const cliente = await crearUsuario();
    const direccion = await crearDireccion(cliente.id);

    const r = await api("GET", `/api/v1/envios/tarifa?direccionId=${direccion.id}`, {
      token: cliente.token,
    });
    assertErrorEstandar(r, 409, "SIN_COBERTURA");
  });

  it("zona inactiva -> 409 SIN_COBERTURA", async () => {
    const cliente = await crearUsuario();
    const zona = await crearZona({ estadoZona: "INACTIVO" });
    const direccion = await crearDireccion(cliente.id, {
      ciudad: zona.ciudad,
      departamento: zona.departamento,
    });

    const r = await api("GET", `/api/v1/envios/tarifa?direccionId=${direccion.id}`, {
      token: cliente.token,
    });
    assertErrorEstandar(r, 409, "SIN_COBERTURA");
  });

  it("RN-003: dirección de OTRO usuario -> 404 (no revela que existe)", async () => {
    const cliente = await crearUsuario();
    const otro = await crearUsuario();
    const zona = await crearZona();
    const ajena = await crearDireccion(otro.id, {
      ciudad: zona.ciudad,
      departamento: zona.departamento,
    });

    const r = await api("GET", `/api/v1/envios/tarifa?direccionId=${ajena.id}`, {
      token: cliente.token,
    });
    assertErrorEstandar(r, 404, "NO_ENCONTRADO");
  });

  it("dirección inexistente -> 404", async () => {
    const cliente = await crearUsuario();
    const r = await api("GET", "/api/v1/envios/tarifa?direccionId=2000000000", {
      token: cliente.token,
    });
    assertErrorEstandar(r, 404, "NO_ENCONTRADO");
  });

  for (const [descripcion, query] of [
    ["sin direccionId", ""],
    ["direccionId vacío", "?direccionId="],
    ["direccionId no numérico", "?direccionId=abc"],
    ["direccionId cero", "?direccionId=0"],
    ["direccionId negativo", "?direccionId=-3"],
  ]) {
    it(`${descripcion} -> 400`, async () => {
      const cliente = await crearUsuario();
      const r = await api("GET", `/api/v1/envios/tarifa${query}`, { token: cliente.token });
      assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
    });
  }
});
