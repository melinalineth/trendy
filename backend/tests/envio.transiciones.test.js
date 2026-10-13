// Tests unitarios (sin base de datos) de validarTransicionEstado (RF-029,
// MOD-05): orden lógico de los estados de envío. Función pura que Sprint 4
// reutiliza al conectar PUT /api/v1/pedidos/:id/estado-envio.
//
// Uso: npm test (o node --test tests/envio.transiciones.test.js)
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// Estos tests no tocan la base, pero envio.service importa los repositories y
// config/prisma exige una URL para armar el adapter (la conexión es lazy: con
// esta URL inalcanzable nunca se abre ninguna). Si el entorno ya trae
// DATABASE_URL se respeta.
process.env.DATABASE_URL ||= "mysql://sin-base:sin-base@127.0.0.1:1/test_sin_conexion";

const {
  validarTransicionEstado,
  TransicionEnvioInvalidaError,
  EstadoEnvioInvalidoError,
  ESTADOS_ENVIO,
  TRANSICIONES_ENVIO,
} = require("../src/services/envio.service");
const errorHandler = require("../src/middlewares/errorHandler");

// Mismos valores que el enum EstadoEnvio de Sprint 4 (schema.prisma).
const ESTADOS = ["EN_PREPARACION", "ENVIADO", "EN_TRANSITO", "ENTREGADO"];

// Única transición válida desde cada estado: avanzar al siguiente.
const PERMITIDAS = new Set([
  "EN_PREPARACION->ENVIADO",
  "ENVIADO->EN_TRANSITO",
  "EN_TRANSITO->ENTREGADO",
]);

// Respuesta mínima de Express para ejercitar errorHandler sin levantar el app.
function resFalso() {
  return {
    statusCode: null,
    body: null,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(cuerpo) {
      this.body = cuerpo;
      return this;
    },
  };
}

describe("validarTransicionEstado (RF-029)", () => {
  it("expone los estados del enum EstadoEnvio de Sprint 4", () => {
    assert.deepEqual([...ESTADOS_ENVIO], ESTADOS);
  });

  describe("matriz completa 4x4", () => {
    for (const actual of ESTADOS) {
      for (const nuevo of ESTADOS) {
        const clave = `${actual}->${nuevo}`;

        if (PERMITIDAS.has(clave)) {
          it(`${clave} es válida y devuelve el estado nuevo`, () => {
            assert.equal(validarTransicionEstado(actual, nuevo), nuevo);
          });
        } else {
          const motivo =
            actual === nuevo
              ? "mismo estado"
              : actual === "ENTREGADO"
                ? "ENTREGADO es terminal"
                : ESTADOS.indexOf(nuevo) < ESTADOS.indexOf(actual)
                  ? "no se retrocede"
                  : "no se saltean pasos";

          it(`${clave} se rechaza con 409 (${motivo})`, () => {
            assert.throws(
              () => validarTransicionEstado(actual, nuevo),
              (error) => {
                assert.ok(error instanceof TransicionEnvioInvalidaError);
                assert.equal(error.status, 409);
                assert.equal(error.codigo, "TRANSICION_ENVIO_INVALIDA");
                return true;
              }
            );
          });
        }
      }
    }
  });

  it("la tabla TRANSICIONES_ENVIO coincide con la matriz esperada", () => {
    const obtenidas = new Set(
      ESTADOS.flatMap((actual) => TRANSICIONES_ENVIO[actual].map((nuevo) => `${actual}->${nuevo}`))
    );
    assert.deepEqual(obtenidas, PERMITIDAS);
    assert.deepEqual(TRANSICIONES_ENVIO.ENTREGADO, []);
  });

  describe("estados desconocidos -> 400", () => {
    const invalidos = [
      "FOO",
      "",
      "enviado", // los valores del enum son sensibles a mayúsculas
      " ENVIADO",
      null,
      undefined,
      42,
      {},
      ["ENVIADO"],
      // propiedades heredadas de Object.prototype: no son estados
      "constructor",
      "__proto__",
      "toString",
    ];

    for (const invalido of invalidos) {
      const etiqueta = typeof invalido === "string" ? JSON.stringify(invalido) : String(invalido);

      it(`estado nuevo ${etiqueta}`, () => {
        assert.throws(
          () => validarTransicionEstado("EN_PREPARACION", invalido),
          (error) => {
            assert.ok(error instanceof EstadoEnvioInvalidoError);
            assert.equal(error.status, 400);
            assert.equal(error.codigo, "ESTADO_ENVIO_INVALIDO");
            return true;
          }
        );
      });

      it(`estado actual ${etiqueta}`, () => {
        assert.throws(
          () => validarTransicionEstado(invalido, "ENVIADO"),
          EstadoEnvioInvalidoError
        );
      });
    }

    it("un estado desconocido gana sobre la regla de transición (400, no 409)", () => {
      assert.throws(() => validarTransicionEstado("ENTREGADO", "FOO"), EstadoEnvioInvalidoError);
      assert.throws(() => validarTransicionEstado("FOO", "FOO"), EstadoEnvioInvalidoError);
    });
  });

  it("es pura: llamarla no muta la tabla de transiciones y los exports están congelados", () => {
    const antes = JSON.stringify(TRANSICIONES_ENVIO);
    validarTransicionEstado("EN_PREPARACION", "ENVIADO");
    assert.throws(() => validarTransicionEstado("ENVIADO", "EN_PREPARACION"));
    assert.equal(JSON.stringify(TRANSICIONES_ENVIO), antes);
    // Los exports están congelados: nadie puede abrir una transición en runtime.
    assert.ok(Object.isFrozen(TRANSICIONES_ENVIO));
    assert.ok(Object.isFrozen(ESTADOS_ENVIO));
  });

  describe("formato de error estándar (DDS §5.3) vía errorHandler", () => {
    it("transición inválida -> 409 TRANSICION_ENVIO_INVALIDA", () => {
      let capturado;
      try {
        validarTransicionEstado("ENTREGADO", "EN_PREPARACION");
      } catch (error) {
        capturado = error;
      }

      const res = resFalso();
      errorHandler(capturado, {}, res, () => {});

      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error.codigo, "TRANSICION_ENVIO_INVALIDA");
      assert.match(res.body.error.mensaje, /ENTREGADO/);
      assert.match(res.body.error.mensaje, /EN_PREPARACION/);
      assert.deepEqual(Object.keys(res.body.error).sort(), ["codigo", "detalles", "mensaje"]);
    });

    it("estado desconocido -> 400 ESTADO_ENVIO_INVALIDO", () => {
      let capturado;
      try {
        validarTransicionEstado("ENVIADO", "PERDIDO");
      } catch (error) {
        capturado = error;
      }

      const res = resFalso();
      errorHandler(capturado, {}, res, () => {});

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.error.codigo, "ESTADO_ENVIO_INVALIDO");
      assert.match(res.body.error.mensaje, /PERDIDO/);
    });
  });
});
