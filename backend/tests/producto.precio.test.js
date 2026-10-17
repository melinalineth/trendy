// Regla de negocio "COP en pesos enteros" (docs/diseno/montos-cop.md): el
// precio de un producto se carga sin centavos, tanto en el alta como en la
// edición. Dos capas:
//   - DTO (zod), sin base de datos: casos de borde del valor.
//   - HTTP (POST / PUT /api/v1/productos): el 400 llega al cliente con el
//     mensaje. El HTTP requiere DATABASE_URL de una base descartable.
const { describe, it, before, beforeEach, after, mock } = require("node:test");
const assert = require("node:assert/strict");

const { crearProductoSchema, actualizarProductoSchema } = require("../src/dtos/producto.dto");
const productoRepository = require("../src/repositories/producto.repository");
const productoService = require("../src/services/producto.service");
const {
  prisma,
  iniciarServidor,
  pedir,
  crearUsuario,
  crearVariante,
  limpiar,
} = require("./helpers/entorno");

const MENSAJE_ENTERO = "El precio debe ser un valor entero en pesos (COP), sin centavos";

const productoBase = { nombre: "Camisa", descripcion: "Camisa de lino", categoriaId: 1 };

// Decimal(10,2) admite hasta 99.999.999,99: el tope entero es 99.999.999.
const PRECIO_MAXIMO = 99999999;
const MENSAJE_TOPE = `El precio no puede superar ${PRECIO_MAXIMO} (COP)`;

function mensajes(resultado) {
  assert.equal(resultado.success, false, "se esperaba que la validación fallara");
  return resultado.error.issues.map((issue) => issue.message);
}

describe("DTO de producto: precio entero en COP", () => {
  describe("alta (crearProductoSchema)", () => {
    for (const precio of [1, 15000, 1999990]) {
      it(`acepta el entero ${precio}`, () => {
        const r = crearProductoSchema.safeParse({ ...productoBase, precio });
        assert.equal(r.success, true);
        assert.equal(r.data.precio, precio);
      });
    }

    for (const [nombre, precio] of [
      ["decimal con centavos", 19990.5],
      ["menor que uno", 0.5],
      ["casi cero (1e-8)", 1e-8],
      ["un centavo", 0.01],
    ]) {
      it(`rechaza ${nombre} (${precio}) con el mensaje de pesos enteros`, () => {
        const r = crearProductoSchema.safeParse({ ...productoBase, precio });
        assert.deepEqual(mensajes(r), [MENSAJE_ENTERO]);
      });
    }

    for (const [nombre, precio] of [
      ["cero", 0],
      ["negativo", -15000],
    ]) {
      it(`rechaza ${nombre} (${precio}): debe ser mayor a 0`, () => {
        const r = crearProductoSchema.safeParse({ ...productoBase, precio });
        assert.ok(mensajes(r).includes("El precio debe ser mayor a 0"));
      });
    }

    // Zod 4 corta el chequeo de enteros antes de seguir con los demás: un
    // decimal negativo informa primero que debe ser entero.
    it("rechaza un decimal NEGATIVO (-10.5) informando primero el motivo de pesos enteros", () => {
      const r = crearProductoSchema.safeParse({ ...productoBase, precio: -10.5 });
      assert.deepEqual(mensajes(r), [MENSAJE_ENTERO]);
    });

    it("acepta el tope (99999999) y rechaza lo que lo supera con el mensaje del tope, no con el de enteros", () => {
      const tope = crearProductoSchema.safeParse({ ...productoBase, precio: PRECIO_MAXIMO });
      assert.equal(tope.success, true);
      assert.equal(tope.data.precio, PRECIO_MAXIMO);

      for (const precio of [PRECIO_MAXIMO + 1, 1e10, 1e21]) {
        const r = crearProductoSchema.safeParse({ ...productoBase, precio });
        assert.deepEqual(mensajes(r), [MENSAJE_TOPE], `precio ${precio}`);
      }
    });

    it("rechaza un string numérico y un precio ausente", () => {
      assert.deepEqual(mensajes(crearProductoSchema.safeParse({ ...productoBase, precio: "15000" })), [
        "El precio es requerido",
      ]);
      assert.deepEqual(mensajes(crearProductoSchema.safeParse({ ...productoBase })), [
        "El precio es requerido",
      ]);
    });
  });

  describe("edición (actualizarProductoSchema)", () => {
    it("acepta el entero 25000 y también omitir el precio (PUT parcial)", () => {
      const conPrecio = actualizarProductoSchema.safeParse({ precio: 25000 });
      assert.equal(conPrecio.success, true);
      assert.equal(conPrecio.data.precio, 25000);

      const sinPrecio = actualizarProductoSchema.safeParse({ nombre: "Nuevo nombre" });
      assert.equal(sinPrecio.success, true);
      assert.equal(sinPrecio.data.precio, undefined);
    });

    for (const precio of [19990.5, 0.5, 1e-8]) {
      it(`rechaza ${precio} con el mensaje de pesos enteros`, () => {
        const r = actualizarProductoSchema.safeParse({ precio });
        assert.deepEqual(mensajes(r), [MENSAJE_ENTERO]);
      });
    }

    for (const precio of [0, -100]) {
      it(`rechaza ${precio}: debe ser mayor a 0`, () => {
        const r = actualizarProductoSchema.safeParse({ precio });
        assert.ok(mensajes(r).includes("El precio debe ser mayor a 0"));
      });
    }

    it("rechaza un string", () => {
      assert.equal(actualizarProductoSchema.safeParse({ precio: "25000" }).success, false);
    });

    it("acepta el tope (99999999) y rechaza lo que lo supera con el mensaje del tope", () => {
      assert.equal(actualizarProductoSchema.safeParse({ precio: PRECIO_MAXIMO }).success, true);

      for (const precio of [PRECIO_MAXIMO + 1, 1e10, 1e21]) {
        const r = actualizarProductoSchema.safeParse({ precio });
        assert.deepEqual(mensajes(r), [MENSAJE_TOPE], `precio ${precio}`);
      }
    });
  });
});

// Defensa en profundidad: si otro caller invoca el service sin pasar por el
// DTO, la misma regla se exige acá y NUNCA llega al repository.
describe("producto.service: precio entero en COP (sin pasar por el DTO)", () => {
  let mockCrear;
  let mockActualizar;
  let mockObtener;

  before(() => {
    mockCrear = mock.method(productoRepository, "crear", async (datos) => ({ id: 1, ...datos }));
    mockActualizar = mock.method(productoRepository, "actualizar", async (id, datos) => ({
      id,
      ...datos,
    }));
    mockObtener = mock.method(productoRepository, "obtenerPorId", async (id) => ({ id }));
  });

  beforeEach(() => {
    mockCrear.mock.resetCalls();
    mockActualizar.mock.resetCalls();
  });

  // No toca la base (repository mockeado): el pool de Prisma ya lo cierra el
  // `after` del describe HTTP con limpiar().
  after(() => {
    mock.restoreAll();
  });

  for (const [nombre, precio, mensaje] of [
    ["con centavos", 19990.5, MENSAJE_ENTERO],
    ["menor que uno", 0.5, MENSAJE_ENTERO],
    ["cero", 0, "El precio debe ser mayor a 0"],
    ["negativo", -100, "El precio debe ser mayor a 0"],
    ["sobre el tope", PRECIO_MAXIMO + 1, MENSAJE_TOPE],
    ["astronómico (1e21)", 1e21, MENSAJE_TOPE],
  ]) {
    it(`crear rechaza un precio ${nombre} y no llega al repository`, async () => {
      await assert.rejects(
        productoService.crear({ ...productoBase, precio }, 1),
        (error) => error.message === mensaje
      );
      assert.equal(mockCrear.mock.callCount(), 0);
    });

    it(`actualizar rechaza un precio ${nombre} y no llega al repository`, async () => {
      await assert.rejects(
        productoService.actualizar(1, { precio }),
        (error) => error.message === mensaje
      );
      assert.equal(mockActualizar.mock.callCount(), 0);
    });
  }

  it("crear y actualizar aceptan un entero válido, y actualizar sin precio (PUT parcial)", async () => {
    await productoService.crear({ ...productoBase, precio: 25000 }, 1);
    assert.equal(mockCrear.mock.calls[0].arguments[0].precio, 25000);

    await productoService.actualizar(1, { precio: PRECIO_MAXIMO });
    assert.equal(mockActualizar.mock.calls[0].arguments[1].precio, PRECIO_MAXIMO);

    await productoService.actualizar(1, { nombre: "Solo nombre" });
    assert.equal(mockActualizar.mock.callCount(), 2);
    assert.equal(mockObtener.mock.callCount() >= 2, true);
  });
});

describe("Productos HTTP: precio entero en COP", () => {
  let servidor;
  let api;
  let admin;
  let variante;

  before(async () => {
    servidor = await iniciarServidor();
    api = (metodo, ruta, opciones) => pedir(servidor.baseUrl, metodo, ruta, opciones);
    admin = await crearUsuario("admin");
    variante = await crearVariante({ precio: "10000.00" });
  });

  after(async () => {
    await servidor.cerrar();
    await limpiar();
  });

  it("POST con precio decimal -> 400 con el mensaje de pesos enteros", async () => {
    const r = await api("POST", "/api/v1/productos", {
      token: admin.token,
      body: { ...productoBase, precio: 19990.5 },
    });

    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.ok(r.body.error.includes(MENSAJE_ENTERO), r.body.error);
  });

  it("POST y PUT con un precio sobre el tope (100000000 y 1e21) -> 400 con el mensaje del tope, no 500", async () => {
    for (const precio of [PRECIO_MAXIMO + 1, 1e21]) {
      const alta = await api("POST", "/api/v1/productos", {
        token: admin.token,
        body: { ...productoBase, precio },
      });
      assert.equal(alta.status, 400, JSON.stringify(alta.body));
      assert.equal(alta.body.error, MENSAJE_TOPE);

      const edicion = await api("PUT", `/api/v1/productos/${variante.productoId}`, {
        token: admin.token,
        body: { precio },
      });
      assert.equal(edicion.status, 400, JSON.stringify(edicion.body));
      assert.equal(edicion.body.error, MENSAJE_TOPE);
    }
  });

  it("PUT con precio decimal -> 400 y el precio guardado no cambia", async () => {
    const r = await api("PUT", `/api/v1/productos/${variante.productoId}`, {
      token: admin.token,
      body: { precio: 12000.5 },
    });

    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.ok(r.body.error.includes(MENSAJE_ENTERO), r.body.error);
    const enBase = await prisma.producto.findUnique({ where: { id: variante.productoId } });
    assert.equal(enBase.precio.toFixed(2), "10000.00");
  });

  it("PUT con precio entero -> 200 y se guarda", async () => {
    const r = await api("PUT", `/api/v1/productos/${variante.productoId}`, {
      token: admin.token,
      body: { precio: 25000 },
    });

    assert.equal(r.status, 200, JSON.stringify(r.body));
    const enBase = await prisma.producto.findUnique({ where: { id: variante.productoId } });
    assert.equal(enBase.precio.toFixed(2), "25000.00");
  });
});
