// Service de consulta de ventas (RF-042): presentación del contrato de
// GET /api/v1/ventas (docs/diseno/ventas-api.md) sobre la base real.
//
// Aislamiento: ventas de este archivo en 2034, y cada consulta acota su período
// con `desde`/`hasta`.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  prisma,
  crearUsuario,
  crearVariante,
  crearDireccion,
  crearVenta,
  limpiar,
} = require("./helpers/entorno");
const { validarFiltrosVentas } = require("../src/dtos/venta.dto");
const ventaService = require("../src/services/venta.service");

const bogota = (texto) => new Date(`${texto}-05:00`);

const consultar = (query) => ventaService.consultar(validarFiltrosVentas(query));

describe("Service de consulta de ventas (RF-042)", () => {
  let cliente;
  let admin;
  let direccion;
  let variante;

  before(async () => {
    cliente = await crearUsuario("cliente");
    admin = await crearUsuario("admin");
    direccion = await crearDireccion(cliente.id);
    variante = await crearVariante({ precio: "12345.00", stock: 100 });
  });

  after(async () => {
    await limpiar();
  });

  const nueva = (extra = {}) =>
    crearVenta({
      usuarioId: cliente.id,
      direccionId: direccion.id,
      lineas: [{ variante, cantidad: 2, precioUnitario: "12345.00" }],
      costoEnvio: 8000,
      ...extra,
    });

  describe("formato del contrato", () => {
    it("devuelve ventas, paginacion y totales con las claves y los tipos exactos", async () => {
      const { venta, pedido } = await nueva({
        registradaEn: bogota("2034-03-10T09:15:00.000"),
        responsableId: admin.id,
      });

      const respuesta = await consultar({ desde: "2034-03-10", hasta: "2034-03-10" });

      assert.deepEqual(Object.keys(respuesta), ["ventas", "paginacion", "totales"]);
      assert.equal(respuesta.ventas.length, 1);
      const [v] = respuesta.ventas;
      assert.deepEqual(Object.keys(v), [
        "id",
        "pedidoId",
        "numeroPedido",
        "estadoPedido",
        "fecha",
        "cliente",
        "metodoPago",
        "estado",
        "anuladaEn",
        "responsable",
        "subtotal",
        "costoEnvio",
        "total",
        "productos",
      ]);
      assert.equal(v.id, venta.id);
      assert.equal(v.pedidoId, pedido.id);
      assert.equal(v.numeroPedido, pedido.numero);
      assert.equal(v.estadoPedido, "CONFIRMADO");
      assert.equal(v.fecha, "2034-03-10T14:15:00.000Z");
      assert.deepEqual(v.cliente, { id: cliente.id, nombre: "Test cliente" });
      assert.equal(v.metodoPago, "MERCADO_PAGO");
      assert.equal(v.estado, "REGISTRADA");
      assert.equal(v.anuladaEn, null);
      assert.deepEqual(v.responsable, { id: admin.id, nombre: "Test admin" });
      // 2 x 12345 = 24690 ; + 8000 = 32690. NÚMEROS, no textos.
      assert.strictEqual(v.subtotal, 24690);
      assert.strictEqual(v.costoEnvio, 8000);
      assert.strictEqual(v.total, 32690);

      assert.equal(v.productos.length, 1);
      const [linea] = v.productos;
      assert.deepEqual(Object.keys(linea), [
        "id",
        "producto",
        "sku",
        "talla",
        "color",
        "cantidad",
        "precioUnitario",
        "subtotal",
      ]);
      assert.equal(linea.id, pedido.detalles[0].id);
      assert.equal(linea.producto, `Producto test ${variante.sku.replace("TEST-", "")}`);
      assert.equal(linea.sku, variante.sku);
      assert.equal(linea.talla, "M");
      assert.equal(linea.color, "Rojo");
      assert.strictEqual(linea.cantidad, 2);
      assert.strictEqual(linea.precioUnitario, 12345);
      assert.strictEqual(linea.subtotal, 24690);

      assert.deepEqual(respuesta.paginacion, { pagina: 1, limite: 50, total: 1, totalPaginas: 1 });
      assert.deepEqual(respuesta.totales, {
        registradas: { cantidad: 1, total: 32690 },
        anuladas: { cantidad: 0, total: 0 },
      });
    });

    it("una venta del webhook de Mercado Pago (sin responsable) trae responsable: null", async () => {
      await nueva({ registradaEn: bogota("2034-03-11T09:15:00.000") });

      const { ventas } = await consultar({ desde: "2034-03-11", hasta: "2034-03-11" });

      assert.equal(ventas[0].responsable, null);
    });

    it("una venta ANULADA trae su estado y anuladaEn en ISO UTC", async () => {
      await nueva({
        registradaEn: bogota("2034-03-12T09:15:00.000"),
        estado: "ANULADA",
        anuladaEn: new Date("2034-03-12T20:00:00.000Z"),
      });

      const { ventas } = await consultar({ desde: "2034-03-12", hasta: "2034-03-12" });

      assert.equal(ventas[0].estado, "ANULADA");
      assert.equal(ventas[0].anuladaEn, "2034-03-12T20:00:00.000Z");
    });

    it("no hay claves sensibles en ningún nivel de la respuesta", async () => {
      // Autosuficiente: crea su propia venta (con responsable) en un día propio.
      await nueva({ registradaEn: bogota("2034-03-13T09:15:00.000"), responsableId: admin.id });

      const respuesta = await consultar({ desde: "2034-03-13", hasta: "2034-03-13" });

      assert.equal(respuesta.ventas.length, 1);
      assert.ok(respuesta.ventas[0].cliente && respuesta.ventas[0].responsable);
      assert.doesNotMatch(JSON.stringify(respuesta), /correo|passwordHash|email|@trendy\.test/i);
    });
  });

  describe("montos sin errores de coma flotante", () => {
    it("convierte los Decimal con centavos a números exactos (subtotal, envío, total y líneas)", async () => {
      // 3 x 19990.55 = 59971.65 ; + 0.35 de envío = 59972.00 (float: 59971.65 * 100 = 5997164.999...)
      const { venta } = await nueva({
        registradaEn: bogota("2034-04-01T10:00:00.000"),
        lineas: [{ variante, cantidad: 3, precioUnitario: "19990.55" }],
        costoEnvio: 0.35,
        metodoPago: "CONTRA_ENTREGA",
      });
      assert.equal(venta.subtotal.toFixed(2), "59971.65");

      const { ventas } = await consultar({ desde: "2034-04-01", hasta: "2034-04-01" });
      const [v] = ventas;

      assert.strictEqual(v.subtotal, 59971.65);
      assert.strictEqual(v.costoEnvio, 0.35);
      assert.strictEqual(v.total, 59972);
      assert.strictEqual(v.productos[0].precioUnitario, 19990.55);
      assert.strictEqual(v.productos[0].subtotal, 59971.65);
      assert.equal(v.metodoPago, "CONTRA_ENTREGA");
    });

    it("el subtotal de línea no pierde centavos aunque el producto de * 3 sea inexacto en float", async () => {
      // 0.10 * 3 = 0.30000000000000004 en float; con centavos enteros es 0.30.
      await nueva({
        registradaEn: bogota("2034-04-02T10:00:00.000"),
        lineas: [{ variante, cantidad: 3, precioUnitario: "0.10" }],
        costoEnvio: 0,
      });

      const { ventas } = await consultar({ desde: "2034-04-02", hasta: "2034-04-02" });

      assert.strictEqual(ventas[0].productos[0].subtotal, 0.3);
    });

    it("los totales suman Decimal exacto: 0.10 + 0.20 = 0.3", async () => {
      const { venta: v1 } = await nueva({ registradaEn: bogota("2034-05-02T10:00:00.000") });
      const { venta: v2 } = await nueva({ registradaEn: bogota("2034-05-03T10:00:00.000") });
      await prisma.venta.update({ where: { id: v1.id }, data: { total: "0.10" } });
      await prisma.venta.update({ where: { id: v2.id }, data: { total: "0.20" } });

      const { totales } = await consultar({ desde: "2034-05-01", hasta: "2034-05-31" });

      assert.deepEqual(totales.registradas, { cantidad: 2, total: 0.3 });
    });
  });

  describe("historia (RN-008)", () => {
    it("los productos muestran el precio de la compra aunque el precio vivo cambie después", async () => {
      const varianteMutable = await crearVariante({ precio: "20000.00", stock: 50 });
      await nueva({
        registradaEn: bogota("2034-06-01T10:00:00.000"),
        lineas: [{ variante: varianteMutable, cantidad: 2, precioUnitario: "20000.00" }],
        costoEnvio: 0,
      });

      await prisma.producto.update({
        where: { id: varianteMutable.productoId },
        data: { precio: "99999.00" },
      });

      const { ventas } = await consultar({ desde: "2034-06-01", hasta: "2034-06-01" });

      assert.strictEqual(ventas[0].productos[0].precioUnitario, 20000);
      assert.strictEqual(ventas[0].productos[0].subtotal, 40000);
      assert.strictEqual(ventas[0].subtotal, 40000);
      assert.strictEqual(ventas[0].total, 40000);
    });

    it("los montos de la venta son los copiados, no los del pedido recalculados", async () => {
      const { venta, pedido } = await nueva({ registradaEn: bogota("2034-06-02T10:00:00.000") });
      // Si el pedido cambiara después, la venta conserva su copia.
      await prisma.pedido.update({ where: { id: pedido.id }, data: { total: "1.00" } });

      const { ventas } = await consultar({ desde: "2034-06-02", hasta: "2034-06-02" });

      assert.equal(ventas[0].id, venta.id);
      assert.strictEqual(ventas[0].total, 32690);
    });
  });

  describe("paginación y totales", () => {
    // Período propio: agosto de 2034. 5 ventas: 4 REGISTRADA (32690 c/u) y 1 ANULADA.
    before(async () => {
      for (let dia = 1; dia <= 4; dia += 1) {
        await nueva({ registradaEn: bogota(`2034-08-0${dia}T10:00:00.000`) });
      }
      await nueva({ registradaEn: bogota("2034-08-05T10:00:00.000"), estado: "ANULADA" });
    });

    const agosto = { desde: "2034-08-01", hasta: "2034-08-31" };

    it("limite=2 con 5 ventas: 3 páginas; la última trae 1", async () => {
      const p1 = await consultar({ ...agosto, limite: "2" });
      const p3 = await consultar({ ...agosto, limite: "2", pagina: "3" });

      assert.deepEqual(p1.paginacion, { pagina: 1, limite: 2, total: 5, totalPaginas: 3 });
      assert.equal(p1.ventas.length, 2);
      assert.deepEqual(p3.paginacion, { pagina: 3, limite: 2, total: 5, totalPaginas: 3 });
      assert.equal(p3.ventas.length, 1);
    });

    it("una página más allá de la última devuelve ventas [] y conserva total y totales", async () => {
      const r = await consultar({ ...agosto, limite: "2", pagina: "9" });

      assert.deepEqual(r.ventas, []);
      assert.deepEqual(r.paginacion, { pagina: 9, limite: 2, total: 5, totalPaginas: 3 });
      assert.equal(r.totales.registradas.cantidad, 4);
    });

    it("los totales cubren todo el período y no cambian con la página ni con el estado", async () => {
      const esperado = {
        registradas: { cantidad: 4, total: 130760 },
        anuladas: { cantidad: 1, total: 32690 },
      };

      assert.deepEqual((await consultar({ ...agosto, limite: "1" })).totales, esperado);
      assert.deepEqual((await consultar({ ...agosto, limite: "1", pagina: "4" })).totales, esperado);
      const anuladas = await consultar({ ...agosto, estado: "ANULADA" });
      assert.deepEqual(anuladas.totales, esperado);
      // El listado sí respeta el estado y `total` es el de la lista filtrada.
      assert.equal(anuladas.ventas.length, 1);
      assert.equal(anuladas.paginacion.total, 1);
      const registradas = await consultar({ ...agosto, estado: "REGISTRADA" });
      assert.deepEqual(registradas.totales, esperado);
      assert.equal(registradas.paginacion.total, 4);
    });

    it("sin ventas: ventas [], totalPaginas 1 y totales en cero (nunca null)", async () => {
      const r = await consultar({ desde: "2036-01-01", hasta: "2036-01-31" });

      assert.deepEqual(r, {
        ventas: [],
        paginacion: { pagina: 1, limite: 50, total: 0, totalPaginas: 1 },
        totales: {
          registradas: { cantidad: 0, total: 0 },
          anuladas: { cantidad: 0, total: 0 },
        },
      });
    });
  });
});
