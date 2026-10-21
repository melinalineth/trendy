// Tests HTTP del 404 de rutas inexistentes.
//
// Una URL que no matchea ninguna ruta tiene que responder JSON con el formato
// estándar de error { error: { codigo, mensaje, detalles } } (DDS §5.3) y no el
// HTML «Cannot GET /x» que manda Express por defecto. Además, el 404 genérico
// no puede tapar ninguna ruta real: las que existen siguen contestando lo mismo
// que antes (ver el bloque de regresión).
//
// Son tests herméticos: no necesitan una base viva. Todas las URLs que se
// piden se resuelven antes de llegar a Prisma (404 genérico, 401 del auth y 400
// de validación del id).
//
// Uso: node --test tests/ruta-no-encontrada.http.test.js
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");

// config/prisma exige una URL para armar el adapter (la conexión es lazy: con
// esta URL inalcanzable nunca se abre ninguna). Si el entorno ya trae
// DATABASE_URL se respeta.
process.env.DATABASE_URL ||= "mysql://sin-base:sin-base@127.0.0.1:1/test_sin_conexion";

const prisma = require("../src/config/prisma");
const app = require("../src/app");

describe("rutas inexistentes -> 404 en JSON", () => {
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

  // Devuelve la respuesta cruda para poder revisar también el content-type y
  // el texto sin parsear (un HTML no se puede parsear como JSON).
  async function pedirCrudo(metodo, ruta, body) {
    const respuesta = await fetch(baseUrl + ruta, {
      method: metodo,
      headers: body !== undefined ? { "content-type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return {
      status: respuesta.status,
      tipo: respuesta.headers.get("content-type") ?? "",
      texto: await respuesta.text(),
    };
  }

  const inexistentes = [
    ["GET", "/api/v1/nada"],
    ["GET", "/api/v1/nada/"],
    ["GET", "/api/v1/nada?x=1&y=2"],
    ["GET", "/nada"],
    ["GET", "/api/v1"],
    ["GET", "/api/v1/productos/abc/zzz"],
    ["POST", "/api/v1/nada"],
    ["POST", "/api/v1/productos/abc/zzz"],
    ["PUT", "/api/v1/nada"],
    ["DELETE", "/api/v1/nada"],
  ];

  for (const [metodo, ruta] of inexistentes) {
    it(`${metodo} ${ruta} responde 404 con el formato estándar de error`, async () => {
      const cuerpo = metodo === "POST" || metodo === "PUT" ? { hola: "mundo" } : undefined;
      const { status, tipo, texto } = await pedirCrudo(metodo, ruta, cuerpo);

      assert.equal(status, 404);
      assert.match(tipo, /application\/json/);

      const body = JSON.parse(texto);
      assert.deepEqual(Object.keys(body), ["error"]);
      assert.deepEqual(Object.keys(body.error).sort(), ["codigo", "detalles", "mensaje"]);
      assert.equal(body.error.codigo, "RUTA_NO_ENCONTRADA");
      assert.equal(typeof body.error.mensaje, "string");
      assert.ok(body.error.mensaje.length > 0);
      assert.equal(body.error.detalles, null);
    });
  }

  it("no devuelve HTML, stack ni rutas internas del servidor", async () => {
    const { texto } = await pedirCrudo("GET", "/api/v1/nada");

    for (const filtrado of ["<html", "<!DOCTYPE", "<pre>", "Cannot GET", "node_modules", "at ", "stack"]) {
      assert.ok(!texto.includes(filtrado), `la respuesta no debe incluir "${filtrado}"`);
    }
  });

  it("no refleja en la respuesta lo que el cliente puso en la URL", async () => {
    const { texto } = await pedirCrudo("GET", "/api/v1/<script>alert(1)</script>");

    assert.ok(!texto.includes("script"), "la respuesta no debe repetir la URL pedida");
  });
});

describe("el 404 genérico no tapa las rutas reales", () => {
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

  async function pedir(metodo, ruta) {
    const respuesta = await fetch(baseUrl + ruta, { method: metodo });
    return { status: respuesta.status, body: await respuesta.json() };
  }

  it("GET / sigue respondiendo el mensaje de la API", async () => {
    const { status, body } = await pedir("GET", "/");

    assert.equal(status, 200);
    assert.deepEqual(body, { mensaje: "API funcionando correctamente" });
  });

  it("GET /api/v1/ventas sin token sigue siendo 401 (lo resuelve el auth, no el 404)", async () => {
    const { status, body } = await pedir("GET", "/api/v1/ventas");

    assert.equal(status, 401);
    assert.deepEqual(body, { error: "Token de autenticación requerido" });
  });

  it("GET /api/v1/productos/not-a-number sigue siendo 400 del controller", async () => {
    const { status, body } = await pedir("GET", "/api/v1/productos/not-a-number");

    assert.equal(status, 400);
    assert.deepEqual(body, { error: "id debe ser numérico" });
  });

  it("POST /api/v1/productos sin token sigue siendo 401", async () => {
    const { status, body } = await pedir("POST", "/api/v1/productos");

    assert.equal(status, 401);
    assert.deepEqual(body, { error: "Token de autenticación requerido" });
  });
});
