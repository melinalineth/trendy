// Repository de LECTURA de ventas (RF-042): listado paginado, conteo y totales
// por estado. Prueba contra la base real (ver tests/helpers/entorno.js).
//
// Aislamiento: la base de tests puede tener ventas de otros archivos, así que
// TODAS las ventas de este archivo se registran en octubre/noviembre de 2031 y
// cada consulta acota ese período con `desde`/`hasta`.
//
// Convención de horas: se escriben en hora de Bogotá (UTC-5) con un helper, así
// los casos de borde se leen como los vive el usuario.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  crearUsuario,
  crearVariante,
  crearDireccion,
  crearVenta,
  limpiar,
} = require("./helpers/entorno");
const { validarFiltrosVentas } = require("../src/dtos/venta.dto");
const ventaRepository = require("../src/repositories/venta.repository");

// Instante UTC de una hora de pared en Bogotá (UTC-5 todo el año).
const bogota = (texto) => new Date(`${texto}-05:00`);

// Filtros ya validados por el DTO, acotados al período del archivo salvo que se
// pisen. Se usa el DTO real para probar también el contrato de fechas.
const filtros = (query = {}, paginacion = {}) => ({
  ...validarFiltrosVentas({ desde: "2031-10-01", hasta: "2031-11-30", ...query }),
  ...paginacion,
});

describe("Repository de consulta de ventas (RF-042)", () => {
  let cliente;
  let otroCliente;
  let admin;
  let direccion;
  let direccionOtro;
  let variante;

  const nueva = (extra = {}) =>
    crearVenta({
      usuarioId: cliente.id,
      direccionId: direccion.id,
      lineas: [{ variante, cantidad: 2, precioUnitario: "10000.00" }],
      costoEnvio: 5000,
      ...extra,
    });

  before(async () => {
    cliente = await crearUsuario("cliente");
    otroCliente = await crearUsuario("cliente");
    admin = await crearUsuario("admin");
    direccion = await crearDireccion(cliente.id);
    direccionOtro = await crearDireccion(otroCliente.id);
    variante = await crearVariante({ precio: "10000.00", stock: 100 });
  });

  after(async () => {
    await limpiar();
  });

  describe("fechas en hora de Bogotá", () => {
    let tardeDel31;
    let pasadaMedianoche;
    let inicioDel31;
    let ultimoMsDel31;
    let inicioDelPrimero;

    before(async () => {
      // 23:30 de Bogotá del 31/10 = 04:30 UTC del 01/11 (otro día en UTC).
      tardeDel31 = (await nueva({ registradaEn: bogota("2031-10-31T23:30:00.000") })).venta;
      // 00:10 de Bogotá del 01/11.
      pasadaMedianoche = (await nueva({ registradaEn: bogota("2031-11-01T00:10:00.000") })).venta;
      // Bordes exactos.
      inicioDel31 = (await nueva({ registradaEn: bogota("2031-10-31T00:00:00.000") })).venta;
      ultimoMsDel31 = (await nueva({ registradaEn: bogota("2031-10-31T23:59:59.999") })).venta;
      inicioDelPrimero = (await nueva({ registradaEn: bogota("2031-11-01T00:00:00.000") })).venta;
    });

    const ids = async (query) =>
      (await ventaRepository.listar(filtros(query, { skip: 0, take: 100 }))).map((v) => v.id);

    it("hasta=31/10 incluye la venta de las 23:30 de Bogotá (que en UTC ya es 01/11)", async () => {
      assert.ok((await ids({ hasta: "2031-10-31" })).includes(tardeDel31.id));
    });

    it("hasta=30/10 NO incluye la venta de las 23:30 de Bogotá del 31/10", async () => {
      assert.ok(!(await ids({ hasta: "2031-10-30" })).includes(tardeDel31.id));
    });

    it("la venta de las 00:10 de Bogotá del 01/11 NO entra con hasta=31/10 y sí con desde=01/11", async () => {
      assert.ok(!(await ids({ hasta: "2031-10-31" })).includes(pasadaMedianoche.id));
      assert.ok((await ids({ desde: "2031-11-01" })).includes(pasadaMedianoche.id));
    });

    it("los bordes exactos: 00:00:00.000 del 31/10 entra con desde=31/10; 23:59:59.999 entra con hasta=31/10; 00:00:00.000 del 01/11 no", async () => {
      const del31 = await ids({ desde: "2031-10-31", hasta: "2031-10-31" });

      assert.ok(del31.includes(inicioDel31.id));
      assert.ok(del31.includes(ultimoMsDel31.id));
      assert.ok(del31.includes(tardeDel31.id));
      assert.ok(!del31.includes(inicioDelPrimero.id));
      assert.ok(!del31.includes(pasadaMedianoche.id));
      assert.ok(!(await ids({ desde: "2031-11-01" })).includes(ultimoMsDel31.id));
    });

    it("el conteo y los totales usan el mismo criterio de fechas que el listado", async () => {
      const f = filtros({ desde: "2031-10-31", hasta: "2031-10-31" });
      const lista = await ventaRepository.listar({ ...f, skip: 0, take: 100 });

      assert.equal(await ventaRepository.contar(f), lista.length);
      assert.equal(lista.length, 3);
      const totales = await ventaRepository.totalesPorEstado(f);
      assert.equal(totales.REGISTRADA.cantidad, 3);
    });
  });

  describe("estado, orden, paginación y conteo", () => {
    let registradas;
    let anulada;

    before(async () => {
      // Período propio (diciembre de 2031) para no mezclar con el bloque anterior.
      registradas = [];
      for (let i = 1; i <= 4; i += 1) {
        registradas.push(
          (await nueva({ registradaEn: bogota(`2031-12-0${i}T10:00:00.000`) })).venta
        );
      }
      anulada = (
        await nueva({
          registradaEn: bogota("2031-12-05T10:00:00.000"),
          estado: "ANULADA",
        })
      ).venta;
    });

    const diciembre = (query = {}, paginacion = {}) =>
      filtros({ desde: "2031-12-01", hasta: "2031-12-31", ...query }, paginacion);

    it("sin estado devuelve todas; con estado filtra", async () => {
      const todas = await ventaRepository.listar(diciembre({}, { skip: 0, take: 100 }));
      assert.equal(todas.length, 5);

      const soloAnuladas = await ventaRepository.listar(
        diciembre({ estado: "ANULADA" }, { skip: 0, take: 100 })
      );
      assert.deepEqual(
        soloAnuladas.map((v) => v.id),
        [anulada.id]
      );

      const soloRegistradas = await ventaRepository.listar(
        diciembre({ estado: "REGISTRADA" }, { skip: 0, take: 100 })
      );
      assert.equal(soloRegistradas.length, 4);
      assert.ok(soloRegistradas.every((v) => v.estado === "REGISTRADA"));
      assert.equal(await ventaRepository.contar(diciembre({ estado: "ANULADA" })), 1);
      assert.equal(await ventaRepository.contar(diciembre({ estado: "REGISTRADA" })), 4);
      assert.equal(await ventaRepository.contar(diciembre()), 5);
    });

    it("ordena por registradaEn descendente", async () => {
      const lista = await ventaRepository.listar(diciembre({}, { skip: 0, take: 100 }));

      assert.deepEqual(
        lista.map((v) => v.id),
        [anulada.id, ...registradas.map((v) => v.id).reverse()]
      );
    });

    it("con la misma registradaEn desempata por id descendente", async () => {
      const mismaHora = bogota("2031-12-20T09:00:00.000");
      const a = (await nueva({ registradaEn: mismaHora })).venta;
      const b = (await nueva({ registradaEn: mismaHora })).venta;
      const c = (await nueva({ registradaEn: mismaHora })).venta;

      const lista = await ventaRepository.listar(
        diciembre({ desde: "2031-12-20", hasta: "2031-12-20" }, { skip: 0, take: 100 })
      );

      assert.deepEqual(
        lista.map((v) => v.id),
        [c.id, b.id, a.id]
      );
    });

    it("pagina con skip/take sin repetir ni saltear ventas", async () => {
      const completa = (await ventaRepository.listar(diciembre({ desde: "2031-12-01", hasta: "2031-12-05" }, { skip: 0, take: 100 }))).map((v) => v.id);
      const rango = { desde: "2031-12-01", hasta: "2031-12-05" };

      const p1 = await ventaRepository.listar(diciembre(rango, { skip: 0, take: 2 }));
      const p2 = await ventaRepository.listar(diciembre(rango, { skip: 2, take: 2 }));
      const p3 = await ventaRepository.listar(diciembre(rango, { skip: 4, take: 2 }));

      assert.deepEqual([p1.length, p2.length, p3.length], [2, 2, 1]);
      assert.deepEqual([...p1, ...p2, ...p3].map((v) => v.id), completa);
      assert.equal(await ventaRepository.contar(diciembre(rango)), 5);
    });
  });

  describe("forma de cada venta", () => {
    it("trae pedido, cliente y responsable con solo los campos necesarios y las líneas históricas", async () => {
      const { venta, pedido } = await nueva({
        registradaEn: bogota("2032-01-10T12:00:00.000"),
        responsableId: admin.id,
        lineas: [
          { variante, cantidad: 3, precioUnitario: "4500.50" },
          { variante, cantidad: 1, precioUnitario: "999.00" },
        ],
      });

      const [fila] = await ventaRepository.listar(
        filtros({ desde: "2032-01-10", hasta: "2032-01-10" }, { skip: 0, take: 10 })
      );

      assert.equal(fila.id, venta.id);
      assert.equal(fila.pedidoId, pedido.id);
      assert.equal(fila.pedido.numero, pedido.numero);
      assert.equal(fila.pedido.estado, "CONFIRMADO");
      assert.deepEqual(Object.keys(fila.cliente).sort(), ["id", "nombre"]);
      assert.deepEqual(Object.keys(fila.responsable).sort(), ["id", "nombre"]);
      assert.equal(fila.responsable.id, admin.id);
      assert.equal(fila.pedido.detalles.length, 2);
      const [l1, l2] = fila.pedido.detalles;
      assert.ok(l1.id < l2.id, "las líneas salen ordenadas por id");
      assert.equal(l1.precioUnitario.toFixed(2), "4500.50");
      assert.equal(l1.cantidad, 3);
      assert.equal(l1.variante.sku, variante.sku);
      assert.equal(l1.variante.talla, "M");
      assert.equal(l1.variante.color, "Rojo");
      assert.equal(typeof l1.variante.producto.nombre, "string");
      assert.equal(fila.metodoPago, "MERCADO_PAGO");
      assert.ok(fila.registradaEn instanceof Date);
      assert.equal(fila.anuladaEn, null);
    });

    it("una venta sin responsable (webhook) trae responsable null", async () => {
      await nueva({ registradaEn: bogota("2032-01-11T12:00:00.000") });

      const [fila] = await ventaRepository.listar(
        filtros({ desde: "2032-01-11", hasta: "2032-01-11" }, { skip: 0, take: 10 })
      );

      assert.equal(fila.responsable, null);
    });

    it("no expone correo ni passwordHash del cliente ni del responsable", async () => {
      await nueva({ registradaEn: bogota("2032-01-12T12:00:00.000"), responsableId: admin.id });

      const [fila] = await ventaRepository.listar(
        filtros({ desde: "2032-01-12", hasta: "2032-01-12" }, { skip: 0, take: 10 })
      );
      const texto = JSON.stringify(fila);

      assert.doesNotMatch(texto, /correo|passwordHash|email|@trendy\.test/i);
    });
  });

  describe("totales por estado", () => {
    // Período propio: febrero de 2032.
    const febrero = (query = {}) =>
      filtros({ desde: "2032-02-01", hasta: "2032-02-29", ...query });

    before(async () => {
      // Registradas: 2 x 10000 + 5000 = 25000 cada una (x2) y una de otro cliente.
      await nueva({ registradaEn: bogota("2032-02-03T10:00:00.000") });
      await nueva({ registradaEn: bogota("2032-02-04T10:00:00.000") });
      await crearVenta({
        usuarioId: otroCliente.id,
        direccionId: direccionOtro.id,
        lineas: [{ variante, cantidad: 1, precioUnitario: "10000.00" }],
        costoEnvio: 0,
        registradaEn: bogota("2032-02-05T10:00:00.000"),
      });
      // Anulada: 25000.
      await nueva({ registradaEn: bogota("2032-02-06T10:00:00.000"), estado: "ANULADA" });
      // Fuera del período (marzo): no debe sumar.
      await nueva({ registradaEn: bogota("2032-03-02T10:00:00.000") });
    });

    it("suma cantidad y total de cada estado del período (total como texto con 2 decimales)", async () => {
      const totales = await ventaRepository.totalesPorEstado(febrero());

      assert.deepEqual(totales, {
        REGISTRADA: { cantidad: 3, total: "60000.00" },
        ANULADA: { cantidad: 1, total: "25000.00" },
      });
    });

    it("IGNORA el filtro estado: con estado=ANULADA siguen viniendo las dos tarjetas", async () => {
      const totales = await ventaRepository.totalesPorEstado(febrero({ estado: "ANULADA" }));

      assert.deepEqual(totales, {
        REGISTRADA: { cantidad: 3, total: "60000.00" },
        ANULADA: { cantidad: 1, total: "25000.00" },
      });
    });

    it("no depende de la página (skip/take no existen para los totales)", async () => {
      const f = febrero({ limite: "1", pagina: "2" });
      const lista = await ventaRepository.listar({ ...f, skip: (f.pagina - 1) * f.limite, take: f.limite });
      const totales = await ventaRepository.totalesPorEstado(f);

      assert.equal(lista.length, 1);
      assert.equal(totales.REGISTRADA.cantidad + totales.ANULADA.cantidad, 4);
    });

    it("sin ventas en el período devuelve ceros, nunca null", async () => {
      const totales = await ventaRepository.totalesPorEstado(
        filtros({ desde: "2035-01-01", hasta: "2035-01-31" })
      );

      assert.deepEqual(totales, {
        REGISTRADA: { cantidad: 0, total: "0.00" },
        ANULADA: { cantidad: 0, total: "0.00" },
      });
    });

    it("suma Decimal exacto: 0.10 + 0.20 da 0.30 (sin errores de coma flotante)", async () => {
      const { venta: v1 } = await nueva({ registradaEn: bogota("2033-05-02T10:00:00.000") });
      const { venta: v2 } = await nueva({ registradaEn: bogota("2033-05-03T10:00:00.000") });
      const prisma = require("../src/config/prisma");
      await prisma.venta.update({ where: { id: v1.id }, data: { total: "0.10" } });
      await prisma.venta.update({ where: { id: v2.id }, data: { total: "0.20" } });

      const totales = await ventaRepository.totalesPorEstado(
        filtros({ desde: "2033-05-01", hasta: "2033-05-31" })
      );

      assert.deepEqual(totales.REGISTRADA, { cantidad: 2, total: "0.30" });
    });
  });
});
