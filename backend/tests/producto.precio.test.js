// Regla de negocio "COP en pesos enteros" (docs/diseno/montos-cop.md): el
// precio de un producto se carga sin centavos, tanto en el alta como en la
// edición. Dos capas:
//   - DTO (zod), sin base de datos: casos de borde del valor.
//   - HTTP (POST / PUT /api/v1/productos): el 400 llega al cliente con el
//     mensaje. El HTTP requiere DATABASE_URL de una base descartable.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { crearProductoSchema, actualizarProductoSchema } = require("../src/dtos/producto.dto");
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
