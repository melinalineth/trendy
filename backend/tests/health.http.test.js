// Tests HTTP de GET /api/v1/health (staging / Docker Compose).
//
//   GET /api/v1/health   público (sin token): 200 { estado: "ok" } si la app
//                        responde y la base contesta; 503 con el formato estándar
//                        de error si la base no responde.
//
// Son tests herméticos: no necesitan una base viva. `health.repository.ping`
// (el `SELECT 1` por el cliente Prisma único) se reemplaza con un mock, así que
// se puede ejercitar el camino "la base no responde" sin tirar ninguna base. No
// se mockea el cliente Prisma directamente porque es un Proxy y node:test no
// puede reemplazar sus métodos. El camino real (MySQL de verdad) lo valida el
// healthcheck del contenedor y scripts/smoke-staging.js.
//
// Uso: node --test tests/health.http.test.js
const { describe, it, before, after, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");

// config/prisma exige una URL para armar el adapter (la conexión es lazy: con
// esta URL inalcanzable nunca se abre ninguna). Si el entorno ya trae
// DATABASE_URL se respeta.
process.env.DATABASE_URL ||= "mysql://sin-base:sin-base@127.0.0.1:1/test_sin_conexion";

const prisma = require("../src/config/prisma");
const healthRepository = require("../src/repositories/health.repository");
const app = require("../src/app");

describe("GET /api/v1/health", () => {
  let servidor;
  let baseUrl;

  before(async () => {
    servidor = app.listen(0);
    await once(servidor, "listening");
    baseUrl = `http://127.0.0.1:${servidor.address().port}`;
  });

  after(async () => {
    servidor.closeAllConnections();
    servidor.close();
    await once(servidor, "close");
    await prisma.$disconnect();
  });

  afterEach(() => {
    mock.restoreAll();
  });

  async function pedirHealth() {
    const respuesta = await fetch(`${baseUrl}/api/v1/health`);
    return { status: respuesta.status, body: await respuesta.json() };
  }

  it("responde 200 { estado: 'ok' } sin token cuando la base contesta", async () => {
    const consulta = mock.method(healthRepository, "ping", async () => true);

    const { status, body } = await pedirHealth();

    assert.equal(status, 200);
    assert.deepEqual(body, { estado: "ok" });
    assert.equal(consulta.mock.callCount(), 1, "debe consultar la base una vez");
  });

  it("responde 503 con el formato estándar de error cuando la base no responde", async () => {
    mock.method(healthRepository, "ping", async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.5:3306 (usuario trendy_user)");
    });
    // errorHandler loguea los 5xx: se silencia acá para no ensuciar la salida.
    mock.method(console, "error", () => {});

    const { status, body } = await pedirHealth();

    assert.equal(status, 503);
    assert.deepEqual(Object.keys(body.error).sort(), ["codigo", "detalles", "mensaje"]);
    assert.equal(body.error.codigo, "BASE_DE_DATOS_NO_DISPONIBLE");
  });

  it("no filtra datos sensibles del error de la base en el 503", async () => {
    mock.method(healthRepository, "ping", async () => {
      throw new Error("Access denied for user 'trendy_user'@'10.0.0.5' (password: YES)");
    });
    mock.method(console, "error", () => {});

    const { status, body } = await pedirHealth();
    const texto = JSON.stringify(body);

    assert.equal(status, 503);
    for (const secreto of ["trendy_user", "10.0.0.5", "password", "Access denied"]) {
      assert.ok(!texto.includes(secreto), `la respuesta no debe incluir "${secreto}"`);
    }
  });

  it("responde 503 (no se cuelga) cuando la base no contesta a tiempo", async () => {
    // Una consulta que nunca resuelve: el endpoint tiene que cortar por tiempo.
    mock.method(healthRepository, "ping", () => new Promise(() => {}));
    mock.method(console, "error", () => {});

    const inicio = Date.now();
    const { status, body } = await pedirHealth();

    assert.equal(status, 503);
    assert.equal(body.error.codigo, "BASE_DE_DATOS_NO_DISPONIBLE");
    assert.ok(Date.now() - inicio < 8000, "debe responder en pocos segundos");
  });

  it("sirve el 200 sin datos extra (solo estado)", async () => {
    mock.method(healthRepository, "ping", async () => true);

    const { body } = await pedirHealth();

    assert.deepEqual(Object.keys(body), ["estado"]);
  });
});
