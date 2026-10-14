// Tests HTTP reales del carrito (DDS §3 MOD-04): levantan el app en un puerto
// libre y le pegan con fetch. Requieren una base MySQL migrada + con seed
// (ver tests/helpers/entorno.js); crean sus propios datos y los limpian.
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
  crearZona,
  crearDireccion,
  limpiar,
} = require("./helpers/entorno");

const PRECIO = 19990.5; // Decimal(10,2) "19990.50"

// DDS §5.3: { error: { codigo, mensaje, detalles } }
function assertErrorEstandar(respuesta, status, codigo) {
  assert.equal(respuesta.status, status, JSON.stringify(respuesta.body));
  assert.deepEqual(Object.keys(respuesta.body.error).sort(), ["codigo", "detalles", "mensaje"]);
  assert.equal(respuesta.body.error.codigo, codigo);
  assert.equal(typeof respuesta.body.error.mensaje, "string");
}

describe("API de carrito", () => {
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

  describe("autenticación y rol", () => {
    const endpoints = [
      ["GET", "/api/v1/carrito"],
      ["POST", "/api/v1/carrito/items"],
      ["PUT", "/api/v1/carrito/items/1"],
      ["DELETE", "/api/v1/carrito/items/1"],
      ["GET", "/api/v1/carrito/resumen"],
      ["GET", "/api/v1/envios/tarifa?direccionId=1"],
    ];

    for (const [metodo, ruta] of endpoints) {
      it(`${metodo} ${ruta} sin token -> 401`, async () => {
        const r = await api(metodo, ruta, { body: metodo === "POST" || metodo === "PUT" ? {} : undefined });
        assert.equal(r.status, 401);
      });
    }

    it("token inválido -> 401", async () => {
      const r = await api("GET", "/api/v1/carrito", { token: "no.es.un.jwt" });
      assert.equal(r.status, 401);
    });

    it("un vendedor no administra carrito (ERS 4.1: solo cliente) -> 403", async () => {
      const vendedor = await crearUsuario("vendedor");
      const r = await api("GET", "/api/v1/carrito", { token: vendedor.token });
      assertErrorEstandar(r, 403, "ACCESO_DENEGADO");
    });
  });

  describe("GET /api/v1/carrito", () => {
    it("carrito vacío -> 200 con totales en cero", async () => {
      const cliente = await crearUsuario();
      const r = await api("GET", "/api/v1/carrito", { token: cliente.token });

      assert.equal(r.status, 200);
      assert.deepEqual(r.body.items, []);
      assert.equal(r.body.subtotal, 0);
      assert.equal(r.body.costoEnvio, 0);
      assert.equal(r.body.total, 0);
      assert.equal(r.body.vacio, true);
    });
  });

  describe("POST /api/v1/carrito/items", () => {
    it("agrega un ítem y, al repetir la variante, suma la cantidad sin duplicar la línea", async () => {
      const cliente = await crearUsuario();
      const variante = await crearVariante({ stock: 5 });

      const primera = await api("POST", "/api/v1/carrito/items", {
        token: cliente.token,
        body: { varianteId: variante.id, cantidad: 2 },
      });
      assert.equal(primera.status, 201);
      assert.equal(primera.body.varianteId, variante.id);
      assert.equal(primera.body.cantidad, 2);

      const segunda = await api("POST", "/api/v1/carrito/items", {
        token: cliente.token,
        body: { varianteId: variante.id, cantidad: 1 },
      });
      assert.equal(segunda.status, 201);
      assert.equal(segunda.body.id, primera.body.id, "debe ser la misma línea");
      assert.equal(segunda.body.cantidad, 3, "2 + 1, no 2 + 2 + 1");

      const carrito = await api("GET", "/api/v1/carrito", { token: cliente.token });
      assert.equal(carrito.body.items.length, 1);
      assert.equal(carrito.body.items[0].cantidad, 3);
      assert.equal(carrito.body.subtotal, PRECIO * 3);
      assert.equal(carrito.body.vacio, false);
    });

    it("cantidad mayor al stock -> 409 STOCK_INSUFICIENTE", async () => {
      const cliente = await crearUsuario();
      const variante = await crearVariante({ stock: 3 });

      const r = await api("POST", "/api/v1/carrito/items", {
        token: cliente.token,
        body: { varianteId: variante.id, cantidad: 4 },
      });
      assertErrorEstandar(r, 409, "STOCK_INSUFICIENTE");
    });

    it("la suma con lo que ya hay en el carrito tampoco puede superar el stock -> 409", async () => {
      const cliente = await crearUsuario();
      const variante = await crearVariante({ stock: 3 });
      const item = { token: cliente.token };

      const ok = await api("POST", "/api/v1/carrito/items", {
        ...item,
        body: { varianteId: variante.id, cantidad: 2 },
      });
      assert.equal(ok.status, 201);

      const r = await api("POST", "/api/v1/carrito/items", {
        ...item,
        body: { varianteId: variante.id, cantidad: 2 },
      });
      assertErrorEstandar(r, 409, "STOCK_INSUFICIENTE");

      const carrito = await api("GET", "/api/v1/carrito", item);
      assert.equal(carrito.body.items[0].cantidad, 2, "no debe cambiar tras el rechazo");
    });

    it("variante inexistente -> 404", async () => {
      const cliente = await crearUsuario();
      const r = await api("POST", "/api/v1/carrito/items", {
        token: cliente.token,
        body: { varianteId: 2000000000, cantidad: 1 },
      });
      assertErrorEstandar(r, 404, "NO_ENCONTRADO");
    });

    it("producto inactivo -> 409", async () => {
      const cliente = await crearUsuario();
      const variante = await crearVariante({ estado: "INACTIVO" });
      const r = await api("POST", "/api/v1/carrito/items", {
        token: cliente.token,
        body: { varianteId: variante.id, cantidad: 1 },
      });
      assertErrorEstandar(r, 409, "CONFLICTO");
    });

    for (const [descripcion, body] of [
      ["body vacío", {}],
      ["sin cantidad", { varianteId: 1 }],
      ["sin varianteId", { cantidad: 1 }],
      ["cantidad cero", { varianteId: 1, cantidad: 0 }],
      ["cantidad negativa", { varianteId: 1, cantidad: -2 }],
      ["cantidad no entera", { varianteId: 1, cantidad: 1.5 }],
      ["cantidad no numérica", { varianteId: 1, cantidad: "abc" }],
    ]) {
      it(`body inválido (${descripcion}) -> 400 con detalles`, async () => {
        const cliente = await crearUsuario();
        const r = await api("POST", "/api/v1/carrito/items", { token: cliente.token, body });
        assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
        assert.ok(Array.isArray(r.body.error.detalles) && r.body.error.detalles.length > 0);
      });
    }
  });

  describe("PUT /api/v1/carrito/items/:id", () => {
    it("modifica la cantidad y devuelve el resumen recalculado", async () => {
      const cliente = await crearUsuario();
      const variante = await crearVariante({ stock: 5 });
      const agregado = await api("POST", "/api/v1/carrito/items", {
        token: cliente.token,
        body: { varianteId: variante.id, cantidad: 1 },
      });

      const r = await api("PUT", `/api/v1/carrito/items/${agregado.body.id}`, {
        token: cliente.token,
        body: { cantidad: 4 },
      });

      assert.equal(r.status, 200);
      assert.equal(r.body.items.length, 1);
      assert.equal(r.body.items[0].cantidad, 4, "se reemplaza, no se suma");
      assert.equal(r.body.subtotal, PRECIO * 4);
      assert.equal(r.body.total, PRECIO * 4);
    });

    it("cantidad mayor al stock -> 409", async () => {
      const cliente = await crearUsuario();
      const variante = await crearVariante({ stock: 5 });
      const agregado = await api("POST", "/api/v1/carrito/items", {
        token: cliente.token,
        body: { varianteId: variante.id, cantidad: 1 },
      });

      const r = await api("PUT", `/api/v1/carrito/items/${agregado.body.id}`, {
        token: cliente.token,
        body: { cantidad: 6 },
      });
      assertErrorEstandar(r, 409, "STOCK_INSUFICIENTE");
    });

    for (const cantidad of [0, -1, 1.5, "abc"]) {
      it(`cantidad inválida (${JSON.stringify(cantidad)}) -> 400`, async () => {
        const cliente = await crearUsuario();
        const variante = await crearVariante();
        const agregado = await api("POST", "/api/v1/carrito/items", {
          token: cliente.token,
          body: { varianteId: variante.id, cantidad: 1 },
        });

        const r = await api("PUT", `/api/v1/carrito/items/${agregado.body.id}`, {
          token: cliente.token,
          body: { cantidad },
        });
        assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
      });
    }

    it("RN-003: un ítem de OTRO usuario -> 404 y no se modifica", async () => {
      const duenio = await crearUsuario();
      const intruso = await crearUsuario();
      const variante = await crearVariante({ stock: 5 });
      const agregado = await api("POST", "/api/v1/carrito/items", {
        token: duenio.token,
        body: { varianteId: variante.id, cantidad: 2 },
      });

      const r = await api("PUT", `/api/v1/carrito/items/${agregado.body.id}`, {
        token: intruso.token,
        body: { cantidad: 5 },
      });
      assertErrorEstandar(r, 404, "NO_ENCONTRADO");

      const enDb = await prisma.itemCarrito.findUnique({ where: { id: agregado.body.id } });
      assert.equal(enDb.cantidad, 2);
    });

    it("ítem inexistente -> 404", async () => {
      const cliente = await crearUsuario();
      const r = await api("PUT", "/api/v1/carrito/items/2000000000", {
        token: cliente.token,
        body: { cantidad: 1 },
      });
      assertErrorEstandar(r, 404, "NO_ENCONTRADO");
    });
  });

  describe("DELETE /api/v1/carrito/items/:id", () => {
    it("elimina el ítem; si era el último informa carrito vacío", async () => {
      const cliente = await crearUsuario();
      const variante = await crearVariante();
      const agregado = await api("POST", "/api/v1/carrito/items", {
        token: cliente.token,
        body: { varianteId: variante.id, cantidad: 1 },
      });

      const r = await api("DELETE", `/api/v1/carrito/items/${agregado.body.id}`, {
        token: cliente.token,
      });
      assert.equal(r.status, 200);
      assert.equal(r.body.vacio, true);
      assert.deepEqual(r.body.items, []);
      assert.equal(r.body.total, 0);

      const carrito = await api("GET", "/api/v1/carrito", { token: cliente.token });
      assert.equal(carrito.body.vacio, true);

      const otraVez = await api("DELETE", `/api/v1/carrito/items/${agregado.body.id}`, {
        token: cliente.token,
      });
      assertErrorEstandar(otraVez, 404, "NO_ENCONTRADO");
    });

    it("si quedan ítems devuelve el resumen de los restantes", async () => {
      const cliente = await crearUsuario();
      const a = await crearVariante();
      const b = await crearVariante();
      const itemA = await api("POST", "/api/v1/carrito/items", {
        token: cliente.token,
        body: { varianteId: a.id, cantidad: 1 },
      });
      await api("POST", "/api/v1/carrito/items", {
        token: cliente.token,
        body: { varianteId: b.id, cantidad: 2 },
      });

      const r = await api("DELETE", `/api/v1/carrito/items/${itemA.body.id}`, {
        token: cliente.token,
      });
      assert.equal(r.status, 200);
      assert.equal(r.body.vacio, false);
      assert.equal(r.body.items.length, 1);
      assert.equal(r.body.subtotal, PRECIO * 2);
    });

    it("RN-003: un ítem de OTRO usuario -> 404 y no se borra", async () => {
      const duenio = await crearUsuario();
      const intruso = await crearUsuario();
      const variante = await crearVariante();
      const agregado = await api("POST", "/api/v1/carrito/items", {
        token: duenio.token,
        body: { varianteId: variante.id, cantidad: 1 },
      });

      const r = await api("DELETE", `/api/v1/carrito/items/${agregado.body.id}`, {
        token: intruso.token,
      });
      assertErrorEstandar(r, 404, "NO_ENCONTRADO");

      const enDb = await prisma.itemCarrito.findUnique({ where: { id: agregado.body.id } });
      assert.ok(enDb, "el ítem del dueño sigue existiendo");
    });
  });

  describe("GET /api/v1/carrito/resumen", () => {
    async function clienteConCarrito() {
      const cliente = await crearUsuario();
      const variante = await crearVariante({ stock: 10 });
      await api("POST", "/api/v1/carrito/items", {
        token: cliente.token,
        body: { varianteId: variante.id, cantidad: 3 },
      });
      return cliente;
    }

    it("sin dirección: subtotal = precio x cantidad y envío en cero", async () => {
      const cliente = await clienteConCarrito();
      const r = await api("GET", "/api/v1/carrito/resumen", { token: cliente.token });

      assert.equal(r.status, 200);
      assert.equal(r.body.subtotal, PRECIO * 3);
      assert.equal(r.body.costoEnvio, 0);
      assert.equal(r.body.total, PRECIO * 3);
    });

    it("con dirección en zona cubierta: suma el costo de envío al total", async () => {
      const cliente = await clienteConCarrito();
      const zona = await crearZona({ costo: "12000.00" });
      const direccion = await crearDireccion(cliente.id, {
        ciudad: zona.ciudad,
        departamento: zona.departamento,
      });

      const r = await api("GET", `/api/v1/carrito/resumen?direccionId=${direccion.id}`, {
        token: cliente.token,
      });

      assert.equal(r.status, 200);
      assert.equal(r.body.subtotal, PRECIO * 3);
      assert.equal(r.body.costoEnvio, 12000);
      assert.equal(r.body.total, PRECIO * 3 + 12000);
    });

    it("dirección sin cobertura -> 409 SIN_COBERTURA", async () => {
      const cliente = await clienteConCarrito();
      const direccion = await crearDireccion(cliente.id);

      const r = await api("GET", `/api/v1/carrito/resumen?direccionId=${direccion.id}`, {
        token: cliente.token,
      });
      assertErrorEstandar(r, 409, "SIN_COBERTURA");
    });

    it("zona cubierta pero sin tarifa activa -> 409 SIN_COBERTURA", async () => {
      const cliente = await clienteConCarrito();
      const zona = await crearZona({ estadoTarifa: "INACTIVO" });
      const direccion = await crearDireccion(cliente.id, {
        ciudad: zona.ciudad,
        departamento: zona.departamento,
      });

      const r = await api("GET", `/api/v1/carrito/resumen?direccionId=${direccion.id}`, {
        token: cliente.token,
      });
      assertErrorEstandar(r, 409, "SIN_COBERTURA");
    });

    it("RN-003: dirección de OTRO usuario -> 404", async () => {
      const cliente = await clienteConCarrito();
      const otro = await crearUsuario();
      const zona = await crearZona();
      const ajena = await crearDireccion(otro.id, {
        ciudad: zona.ciudad,
        departamento: zona.departamento,
      });

      const r = await api("GET", `/api/v1/carrito/resumen?direccionId=${ajena.id}`, {
        token: cliente.token,
      });
      assertErrorEstandar(r, 404, "NO_ENCONTRADO");
    });

    it("dirección inexistente -> 404", async () => {
      const cliente = await clienteConCarrito();
      const r = await api("GET", "/api/v1/carrito/resumen?direccionId=2000000000", {
        token: cliente.token,
      });
      assertErrorEstandar(r, 404, "NO_ENCONTRADO");
    });

    it("direccionId no numérico -> 400", async () => {
      const cliente = await clienteConCarrito();
      const r = await api("GET", "/api/v1/carrito/resumen?direccionId=abc", {
        token: cliente.token,
      });
      assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
    });
  });
});
