// Esquema de datos de Venta (Sprint 5, RF-041; RN-008 / ERS 4.12). Cubre el
// modelo, sus garantías a nivel de base (unique del pedido, FKs sin cascade,
// índices) y el backfill de la migración `add_venta`. Todavía NO hay
// repository/service/rutas de ventas: estas pruebas hablan directo con Prisma.
//
// Diseño que se verifica:
//   - subtotal / costoEnvio / total se COPIAN del pedido (no se recalculan);
//     productos y cantidades NO se duplican (salen de DetallePedido).
//   - `pedidoId @unique` es la garantía de que una venta no se registra dos
//     veces.
//   - una venta nunca se borra: se anula (estado ANULADA + anuladaEn).
//   - `responsableId` NULL cuando la dispara el webhook de Mercado Pago (sin
//     usuario); guarda al admin/vendedor en un cambio manual de estado.
//
// Uso: DATABASE_URL=mysql://... npm test (base descartable: ver entorno.js).
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  prisma,
  crearUsuario,
  crearVariante,
  crearDireccion,
  crearPedido,
  limpiar,
} = require("./helpers/entorno");

const ID_INEXISTENTE = 2147483000;

// Código de error de Prisma que lanza `promesa` (o null si no falla).
async function codigoDeError(promesa) {
  try {
    await promesa;
    return null;
  } catch (error) {
    return error.code ?? error.message;
  }
}

describe("Esquema de Venta (RF-041)", () => {
  let cliente;
  let otroCliente;
  let admin;
  let vendedor;
  let variante;
  let direccion;

  // Pedido real del cliente (una línea de 2 x 12345.00 + 8000 de envío).
  const pedidoDe = (opciones = {}) =>
    crearPedido({
      usuarioId: cliente.id,
      direccionId: direccion.id,
      lineas: [{ variante, cantidad: 2, precioUnitario: "12345.00" }],
      costoEnvio: 8000,
      estado: "CONFIRMADO",
      ...opciones,
    });

  // Venta copiando los montos del pedido, como lo hará el service (tarjetas
  // siguientes).
  const ventaDe = (pedido, extra = {}) =>
    prisma.venta.create({
      data: {
        pedidoId: pedido.id,
        clienteId: pedido.usuarioId,
        subtotal: pedido.subtotal,
        costoEnvio: pedido.costoEnvio,
        total: pedido.total,
        metodoPago: pedido.metodoPago,
        ...extra,
      },
    });

  before(async () => {
    cliente = await crearUsuario("cliente");
    otroCliente = await crearUsuario("cliente");
    admin = await crearUsuario("admin");
    vendedor = await crearUsuario("vendedor");
    variante = await crearVariante({ precio: "12345.00", stock: 100 });
    direccion = await crearDireccion(cliente.id);
  });

  after(async () => {
    await limpiar();
  });

  describe("modelo", () => {
    it("crea una venta válida con sus defaults y los montos copiados con exactitud", async () => {
      const pedido = await pedidoDe({ metodoPago: "MERCADO_PAGO" });

      const venta = await ventaDe(pedido);

      assert.equal(typeof venta.id, "number");
      assert.equal(venta.pedidoId, pedido.id);
      assert.equal(venta.clienteId, cliente.id);
      assert.equal(venta.estado, "REGISTRADA");
      assert.ok(venta.registradaEn instanceof Date);
      assert.ok(Math.abs(venta.registradaEn.getTime() - Date.now()) < 60_000);
      assert.equal(venta.anuladaEn, null);
      assert.equal(venta.responsableId, null);
      assert.equal(venta.metodoPago, "MERCADO_PAGO");
      // 2 x 12345.00 = 24690.00 ; + 8000.00 de envío = 32690.00
      assert.equal(venta.subtotal.toFixed(2), "24690.00");
      assert.equal(venta.costoEnvio.toFixed(2), "8000.00");
      assert.equal(venta.total.toFixed(2), "32690.00");
    });

    it("conserva los centavos de un pedido legacy sin redondear (Decimal(10,2))", async () => {
      const pedido = await pedidoDe({
        lineas: [{ variante, cantidad: 3, precioUnitario: "19990.55" }],
        costoEnvio: 0.35,
        metodoPago: "CONTRA_ENTREGA",
      });

      const venta = await ventaDe(pedido);

      // 3 x 19990.55 = 59971.65 ; + 0.35 = 59972.00
      assert.equal(venta.subtotal.toFixed(2), "59971.65");
      assert.equal(venta.costoEnvio.toFixed(2), "0.35");
      assert.equal(venta.total.toFixed(2), "59972.00");
      assert.equal(venta.metodoPago, "CONTRA_ENTREGA");
    });

    it("pedidoId es único: una segunda venta del mismo pedido falla con P2002", async () => {
      const pedido = await pedidoDe();
      await ventaDe(pedido);

      assert.equal(await codigoDeError(ventaDe(pedido)), "P2002");
      assert.equal(await prisma.venta.count({ where: { pedidoId: pedido.id } }), 1);
    });

    it("clienteId inexistente falla por FK (P2003)", async () => {
      const pedido = await pedidoDe();

      assert.equal(await codigoDeError(ventaDe(pedido, { clienteId: ID_INEXISTENTE })), "P2003");
      assert.equal(await prisma.venta.count({ where: { pedidoId: pedido.id } }), 0);
    });

    it("responsableId inexistente falla por FK (P2003); uno válido (admin o vendedor) se guarda", async () => {
      const pedido = await pedidoDe();
      assert.equal(
        await codigoDeError(ventaDe(pedido, { responsableId: ID_INEXISTENTE })),
        "P2003"
      );

      const conAdmin = await ventaDe(pedido, { responsableId: admin.id });
      assert.equal(conAdmin.responsableId, admin.id);

      const otro = await pedidoDe();
      const conVendedor = await ventaDe(otro, { responsableId: vendedor.id });
      assert.equal(conVendedor.responsableId, vendedor.id);
    });

    // El valor inválido NO pasa por Prisma Client (que lo rechazaría antes de
    // llegar a MySQL): se inserta con SQL crudo para probar el ENUM de la
    // columna (strict mode de MySQL).
    it("el ENUM de la columna estado rechaza en MySQL un valor fuera de REGISTRADA / ANULADA (SQL crudo)", async () => {
      const pedido = await pedidoDe();

      await assert.rejects(
        prisma.$executeRawUnsafe(
          "INSERT INTO `Venta` (`pedidoId`, `clienteId`, `subtotal`, `costoEnvio`, `total`, `metodoPago`, `estado`) " +
            `VALUES (${pedido.id}, ${pedido.usuarioId}, 1, 0, 1, 'MERCADO_PAGO', 'PENDIENTE')`
        ),
        /Data truncated|1265|enum|estado/i
      );
      assert.equal(await prisma.venta.count({ where: { pedidoId: pedido.id } }), 0);
    });
  });

  describe("relaciones", () => {
    it("pedido.venta, usuario.ventasComoCliente y usuario.ventasGestionadas son navegables", async () => {
      const direccionOtro = await crearDireccion(otroCliente.id);
      const pedido = await pedidoDe({
        usuarioId: otroCliente.id,
        direccionId: direccionOtro.id,
      });
      const venta = await ventaDe(pedido, { responsableId: vendedor.id });

      const conVenta = await prisma.pedido.findUnique({
        where: { id: pedido.id },
        include: { venta: true },
      });
      assert.equal(conVenta.venta.id, venta.id);

      const comoCliente = await prisma.usuario.findUnique({
        where: { id: otroCliente.id },
        include: { ventasComoCliente: true, ventasGestionadas: true },
      });
      assert.deepEqual(
        comoCliente.ventasComoCliente.map((v) => v.id),
        [venta.id]
      );
      assert.deepEqual(comoCliente.ventasGestionadas, []);

      const gestionadas = await prisma.usuario.findUnique({
        where: { id: vendedor.id },
        include: { ventasGestionadas: true },
      });
      assert.ok(gestionadas.ventasGestionadas.some((v) => v.id === venta.id));

      const completa = await prisma.venta.findUnique({
        where: { id: venta.id },
        include: { pedido: true, cliente: true, responsable: true },
      });
      assert.equal(completa.pedido.id, pedido.id);
      assert.equal(completa.cliente.id, otroCliente.id);
      assert.equal(completa.responsable.id, vendedor.id);
    });

    it("un pedido sin venta tiene venta null (la relación es opcional)", async () => {
      const pedido = await pedidoDe({ estado: "PENDIENTE" });

      const conVenta = await prisma.pedido.findUnique({
        where: { id: pedido.id },
        include: { venta: true },
      });

      assert.equal(conVenta.venta, null);
    });
  });

  describe("anulación y borrado", () => {
    it("anular es un cambio de estado (ANULADA + anuladaEn): el registro y los montos se conservan", async () => {
      const pedido = await pedidoDe();
      const venta = await ventaDe(pedido);

      const anulada = await prisma.venta.update({
        where: { id: venta.id },
        data: { estado: "ANULADA", anuladaEn: new Date(), responsableId: admin.id },
      });

      assert.equal(anulada.estado, "ANULADA");
      assert.ok(anulada.anuladaEn instanceof Date);
      assert.equal(anulada.total.toFixed(2), venta.total.toFixed(2));
      assert.equal(await prisma.venta.count({ where: { id: venta.id } }), 1);
    });

    // Comportamiento REAL del FK (ON DELETE RESTRICT, sin cascade): mientras
    // exista la Venta no se puede borrar su Pedido ni su cliente, ni siquiera
    // anulada. Las ventas no se borran nunca. Los pedidos de estos casos no
    // tienen líneas, para que el único FK que impide el borrado sea el de Venta.
    it("borrar el Pedido de una venta falla por FK (P2003): no hay cascade, ni siquiera si está ANULADA", async () => {
      const pedido = await pedidoDe({ lineas: [] });
      const venta = await ventaDe(pedido);

      assert.equal(await codigoDeError(prisma.pedido.delete({ where: { id: pedido.id } })), "P2003");

      await prisma.venta.update({
        where: { id: venta.id },
        data: { estado: "ANULADA", anuladaEn: new Date() },
      });
      assert.equal(await codigoDeError(prisma.pedido.delete({ where: { id: pedido.id } })), "P2003");
      assert.equal(await prisma.pedido.count({ where: { id: pedido.id } }), 1);
      assert.equal(await prisma.venta.count({ where: { id: venta.id } }), 1);
    });

    // Los FK hacia Usuario son RESTRICT: la venta conserva a su cliente y a
    // quien la gestionó. Cada test deja libre SOLO el FK que discrimina.
    it("borrar al responsable de una venta falla por FK (P2003): no se modifica la venta en silencio", async () => {
      const gestor = await crearUsuario("vendedor");
      const pedido = await pedidoDe({ lineas: [] });
      const venta = await ventaDe(pedido, { responsableId: gestor.id });

      assert.equal(await codigoDeError(prisma.usuario.delete({ where: { id: gestor.id } })), "P2003");

      const despues = await prisma.venta.findUnique({ where: { id: venta.id } });
      assert.equal(despues.responsableId, gestor.id);
    });

    // El titular NO tiene pedidos ni direcciones propias (si las tuviera, el
    // borrado fallaría por Pedido_usuarioId_fkey y no probaría nada de Venta):
    // es clienteId de una venta cuyo pedido es de OTRO usuario. Solo
    // Venta_clienteId_fkey puede impedir borrarlo.
    it("borrar al cliente de una venta falla por Venta_clienteId_fkey (P2003)", async () => {
      const titular = await crearUsuario("cliente");
      assert.equal(await prisma.pedido.count({ where: { usuarioId: titular.id } }), 0);
      assert.equal(await prisma.direccion.count({ where: { usuarioId: titular.id } }), 0);
      const pedidoAjeno = await pedidoDe({ lineas: [] });
      await ventaDe(pedidoAjeno, { clienteId: titular.id });

      let error;
      try {
        await prisma.usuario.delete({ where: { id: titular.id } });
      } catch (e) {
        error = e;
      }

      assert.equal(error?.code, "P2003", error?.message);
      assert.match(JSON.stringify(error.meta ?? {}) + error.message, /Venta_clienteId_fkey/);
      assert.equal(await prisma.usuario.count({ where: { id: titular.id } }), 1);
    });
  });

  describe("índices", () => {
    it("existen los índices de (registradaEn) y de (estado, registradaEn), y el unique de pedidoId", async () => {
      const filas = await prisma.$queryRaw`
        SELECT INDEX_NAME AS nombre,
               NON_UNIQUE AS noUnico,
               GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columnas
        FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'Venta'
        GROUP BY INDEX_NAME, NON_UNIQUE`;
      const indices = filas.map((f) => ({
        nombre: f.nombre,
        unico: Number(f.noUnico) === 0,
        columnas: f.columnas,
      }));

      const con = (columnas) => indices.find((i) => i.columnas === columnas);

      assert.ok(con("registradaEn"), JSON.stringify(indices));
      assert.equal(con("registradaEn").unico, false);
      assert.ok(con("estado,registradaEn"), JSON.stringify(indices));
      assert.equal(con("estado,registradaEn").unico, false);
      assert.ok(con("pedidoId"), JSON.stringify(indices));
      assert.equal(con("pedidoId").unico, true);
    });
  });

  // Backfill de la migración `add_venta`: crea una Venta REGISTRADA por cada
  // pedido ya confirmado. Se extrae el SQL del propio migration.sql y se
  // ejecuta tal cual, para probar lo que realmente corre en `migrate deploy`.
  describe("backfill de la migración add_venta", () => {
    const CONFIRMADOS = ["CONFIRMADO", "EN_PREPARACION", "ENVIADO", "EN_TRANSITO", "ENTREGADO"];
    const NO_CONFIRMADOS = [
      "PENDIENTE",
      "CANCELADO",
      // Legados / transitorios de pago: la venta nace al pasar a CONFIRMADO.
      "PAGO_APROBADO",
      "PAGO_RECHAZADO",
      "PAGO_PENDIENTE",
    ];

    function sqlDelBackfill() {
      const carpeta = path.join(__dirname, "..", "prisma", "migrations");
      const migracion = fs.readdirSync(carpeta).find((nombre) => nombre.endsWith("_backfill_ventas"));
      assert.ok(migracion, "no existe la migración backfill_ventas");

      const sql = fs.readFileSync(path.join(carpeta, migracion, "migration.sql"), "utf8");
      const inicio = sql.indexOf("INSERT INTO `Venta`");
      assert.notEqual(inicio, -1, "la migración no contiene el backfill");

      return sql.slice(inicio, sql.indexOf(";", inicio));
    }

    const pedidosPorEstado = {};

    before(async () => {
      // La tabla Venta la manejan solo los tests: se parte de una vacía para
      // que el backfill se compare contra los pedidos de este bloque.
      await prisma.venta.deleteMany({});

      let minuto = 0;
      for (const estado of [...CONFIRMADOS, ...NO_CONFIRMADOS]) {
        for (const metodoPago of ["MERCADO_PAGO", "CONTRA_ENTREGA"]) {
          pedidosPorEstado[`${estado}/${metodoPago}`] = await pedidoDe({
            estado,
            metodoPago,
            lineas: [{ variante, cantidad: 2 + minuto, precioUnitario: "12345.00" }],
            costoEnvio: 8000 + minuto,
            creadoEn: new Date(Date.UTC(2026, 0, 15, 10, ++minuto, 30)),
          });
        }
      }
    });

    after(async () => {
      await prisma.venta.deleteMany({});
    });

    it("el backfill solo toma pedidos confirmados y copia montos, método, cliente y fecha", async () => {
      const antes = await prisma.venta.count();
      assert.equal(antes, 0);

      await prisma.$executeRawUnsafe(sqlDelBackfill());

      const ventas = await prisma.venta.findMany({ include: { pedido: true } });
      const idsMios = new Set(Object.values(pedidosPorEstado).map((p) => p.id));
      const mias = ventas.filter((v) => idsMios.has(v.pedidoId));

      // Una venta por cada pedido confirmado (5 estados x 2 métodos) y ninguna
      // para PENDIENTE, CANCELADO ni los estados de pago.
      assert.equal(mias.length, CONFIRMADOS.length * 2);
      assert.deepEqual(
        [...new Set(mias.map((v) => v.pedido.estado))].sort(),
        [...CONFIRMADOS].sort()
      );
      for (const estado of NO_CONFIRMADOS) {
        for (const metodo of ["MERCADO_PAGO", "CONTRA_ENTREGA"]) {
          const pedido = pedidosPorEstado[`${estado}/${metodo}`];
          assert.equal(
            ventas.some((v) => v.pedidoId === pedido.id),
            false,
            `${estado}/${metodo} no debe generar venta`
          );
        }
      }

      for (const venta of mias) {
        const { pedido } = venta;
        assert.equal(venta.clienteId, pedido.usuarioId);
        assert.equal(venta.metodoPago, pedido.metodoPago);
        assert.equal(venta.subtotal.toFixed(2), pedido.subtotal.toFixed(2));
        assert.equal(venta.costoEnvio.toFixed(2), pedido.costoEnvio.toFixed(2));
        assert.equal(venta.total.toFixed(2), pedido.total.toFixed(2));
        assert.equal(venta.estado, "REGISTRADA");
        assert.equal(venta.registradaEn.getTime(), pedido.creadoEn.getTime());
        assert.equal(venta.anuladaEn, null);
        assert.equal(venta.responsableId, null);
      }
    });

    // El backfill NO es idempotente a propósito: corre UNA sola vez, en su
    // propia migración (backfill_ventas). Si se repite, el unique de pedidoId
    // lo rechaza (error de duplicado) y, al ser una sola sentencia INSERT
    // atómica en InnoDB, no deja ventas a medias. Autocontenido: parte de una
    // tabla Venta vacía y lo corre él mismo la primera vez.
    it("repetir el backfill no duplica nada: el unique de pedidoId lo rechaza", async () => {
      await prisma.venta.deleteMany({});
      await prisma.$executeRawUnsafe(sqlDelBackfill());
      const antes = await prisma.venta.count();
      assert.ok(antes >= CONFIRMADOS.length * 2, "la primera corrida debió crear las ventas");

      await assert.rejects(prisma.$executeRawUnsafe(sqlDelBackfill()), /Duplicate|1062|P2010/i);

      assert.equal(await prisma.venta.count(), antes);
    });
  });
});
