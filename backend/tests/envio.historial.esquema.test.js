// Esquema de HistorialEstadoEnvio (Sprint 4, RF-028 / RF-029; propuesta de
// docs/diseno/info-envio.md §5). Cubre el modelo, sus garantías a nivel de base
// (FKs RESTRICT sin cascade, índice por (infoEnvioId, creadoEn)) y el orden de
// la carpeta de la migración. El service que escribe el historial se prueba en
// envio.historial.http.test.js: acá se habla directo con Prisma.
//
// Diseño que se verifica:
//   - una fila por cambio de estado de envío: estadoAnterior (NULL en el alta),
//     estadoNuevo, usuario que lo hizo y fecha/hora.
//   - el historial NUNCA se borra en cascada: ni el InfoEnvio ni el Usuario con
//     historial se pueden borrar (ON DELETE RESTRICT).
//   - la migración tiene que quedar DESPUÉS de las de sprint-5-base
//     (20261017220145_add_venta y 20261017220200_backfill_ventas) para que, al
//     juntar las ramas, el orden de aplicación siga creciente.
//
// Uso: DATABASE_URL=mysql://... npm test (base descartable: ver entorno.js).
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  prisma,
  crearUsuario,
  crearDireccion,
  crearPedido,
  limpiar,
} = require("./helpers/entorno");

const ID_INEXISTENTE = 2147483000;
const ULTIMA_MIGRACION_DE_SPRINT_5 = "20261017220200";

// Código de error de Prisma que lanza `promesa` (o null si no falla).
async function codigoDeError(promesa) {
  try {
    await promesa;
    return null;
  } catch (error) {
    return error.code ?? error.message;
  }
}

describe("Esquema de HistorialEstadoEnvio (RF-028, RF-029)", () => {
  let cliente;
  let staff;
  let direccion;

  // Pedido con InfoEnvio (EN_PREPARACION) creado directo con prisma.
  const pedidoConEnvio = () =>
    crearPedido({
      usuarioId: cliente.id,
      direccionId: direccion.id,
      lineas: [],
      estado: "EN_PREPARACION",
      estadoEnvio: "EN_PREPARACION",
    });

  const historialDe = (pedido, extra = {}) =>
    prisma.historialEstadoEnvio.create({
      data: {
        infoEnvioId: pedido.infoEnvio.id,
        estadoAnterior: "EN_PREPARACION",
        estadoNuevo: "ENVIADO",
        usuarioId: staff.id,
        ...extra,
      },
    });

  before(async () => {
    cliente = await crearUsuario("cliente");
    staff = await crearUsuario("vendedor");
    direccion = await crearDireccion(cliente.id);
  });

  after(async () => {
    await limpiar();
  });

  describe("modelo", () => {
    it("crea una fila con fecha automática; estadoAnterior admite NULL (alta del InfoEnvio)", async () => {
      const pedido = await pedidoConEnvio();

      const alta = await historialDe(pedido, { estadoAnterior: null, estadoNuevo: "EN_PREPARACION", usuarioId: cliente.id });
      const cambio = await historialDe(pedido);

      assert.equal(typeof alta.id, "number");
      assert.equal(alta.estadoAnterior, null);
      assert.equal(alta.estadoNuevo, "EN_PREPARACION");
      assert.equal(alta.usuarioId, cliente.id);
      assert.ok(alta.creadoEn instanceof Date);
      assert.ok(Math.abs(alta.creadoEn.getTime() - Date.now()) < 60_000);
      assert.equal(cambio.estadoAnterior, "EN_PREPARACION");
      assert.equal(cambio.estadoNuevo, "ENVIADO");
      assert.equal(cambio.usuarioId, staff.id);
    });

    it("infoEnvioId inexistente falla por FK (P2003)", async () => {
      const pedido = await pedidoConEnvio();

      assert.equal(
        await codigoDeError(historialDe(pedido, { infoEnvioId: ID_INEXISTENTE })),
        "P2003"
      );
    });

    it("usuarioId inexistente falla por FK (P2003): el usuario es obligatorio (RF-029)", async () => {
      const pedido = await pedidoConEnvio();

      assert.equal(await codigoDeError(historialDe(pedido, { usuarioId: ID_INEXISTENTE })), "P2003");
      assert.equal(await prisma.historialEstadoEnvio.count({ where: { infoEnvioId: pedido.infoEnvio.id } }), 0);
    });

    // NULL explícito (no se omite la columna): un ENUM NOT NULL sin default
    // toma su primer valor si se omite, así que solo el NULL prueba el NOT NULL.
    it("usuarioId y estadoNuevo son obligatorios: NULL se rechaza en MySQL (SQL crudo)", async () => {
      const pedido = await pedidoConEnvio();

      await assert.rejects(
        prisma.$executeRawUnsafe(
          "INSERT INTO `HistorialEstadoEnvio` (`infoEnvioId`, `estadoNuevo`, `usuarioId`) " +
            `VALUES (${pedido.infoEnvio.id}, 'ENVIADO', NULL)`
        ),
        /usuarioId|1048|cannot be null/i
      );
      await assert.rejects(
        prisma.$executeRawUnsafe(
          "INSERT INTO `HistorialEstadoEnvio` (`infoEnvioId`, `estadoNuevo`, `usuarioId`) " +
            `VALUES (${pedido.infoEnvio.id}, NULL, ${staff.id})`
        ),
        /estadoNuevo|1048|cannot be null/i
      );
      assert.equal(await prisma.historialEstadoEnvio.count({ where: { infoEnvioId: pedido.infoEnvio.id } }), 0);
    });

    // El valor inválido NO pasa por Prisma Client (que lo rechazaría antes de
    // llegar a MySQL): se inserta con SQL crudo para probar el ENUM de la
    // columna (strict mode de MySQL).
    it("los ENUM de la columna rechazan en MySQL un valor fuera de EstadoEnvio (SQL crudo)", async () => {
      const pedido = await pedidoConEnvio();

      for (const columna of ["estadoAnterior", "estadoNuevo"]) {
        await assert.rejects(
          prisma.$executeRawUnsafe(
            "INSERT INTO `HistorialEstadoEnvio` (`infoEnvioId`, `estadoAnterior`, `estadoNuevo`, `usuarioId`) " +
              `VALUES (${pedido.infoEnvio.id}, ${columna === "estadoAnterior" ? "'CANCELADO'" : "NULL"}, ` +
              `${columna === "estadoNuevo" ? "'CANCELADO'" : "'ENVIADO'"}, ${staff.id})`
          ),
          /Data truncated|1265|enum|estado/i,
          columna
        );
      }
      assert.equal(await prisma.historialEstadoEnvio.count({ where: { infoEnvioId: pedido.infoEnvio.id } }), 0);
    });
  });

  describe("relaciones", () => {
    it("infoEnvio.historial y usuario.historialEnvios son navegables", async () => {
      const pedido = await pedidoConEnvio();
      const fila = await historialDe(pedido);

      const info = await prisma.infoEnvio.findUnique({
        where: { id: pedido.infoEnvio.id },
        include: { historial: true },
      });
      assert.deepEqual(info.historial.map((h) => h.id), [fila.id]);

      const usuario = await prisma.usuario.findUnique({
        where: { id: staff.id },
        include: { historialEnvios: true },
      });
      assert.ok(usuario.historialEnvios.some((h) => h.id === fila.id));

      const completa = await prisma.historialEstadoEnvio.findUnique({
        where: { id: fila.id },
        include: { infoEnvio: true, usuario: true },
      });
      assert.equal(completa.infoEnvio.id, pedido.infoEnvio.id);
      assert.equal(completa.usuario.id, staff.id);
    });
  });

  // Comportamiento REAL de los FK (ON DELETE RESTRICT, sin cascade): el
  // historial es el registro de quién hizo qué, no se pierde en silencio. Cada
  // test deja libre SOLO el FK que discrimina.
  describe("borrado", () => {
    it("borrar el InfoEnvio con historial falla por FK (P2003): no hay cascade", async () => {
      const pedido = await pedidoConEnvio();
      const fila = await historialDe(pedido);

      let error;
      try {
        await prisma.infoEnvio.delete({ where: { id: pedido.infoEnvio.id } });
      } catch (e) {
        error = e;
      }

      assert.equal(error?.code, "P2003", error?.message);
      assert.match(JSON.stringify(error.meta ?? {}) + error.message, /HistorialEstadoEnvio_infoEnvioId_fkey/);
      assert.equal(await prisma.infoEnvio.count({ where: { id: pedido.infoEnvio.id } }), 1);
      assert.equal(await prisma.historialEstadoEnvio.count({ where: { id: fila.id } }), 1);
    });

    // El autor NO tiene pedidos, direcciones ni nada más a su nombre (si los
    // tuviera, el borrado fallaría por otro FK y no probaría nada del
    // historial): solo HistorialEstadoEnvio_usuarioId_fkey puede impedirlo.
    it("borrar al usuario que hizo un cambio falla por FK (P2003): no se modifica el historial", async () => {
      const autor = await crearUsuario("vendedor");
      assert.equal(await prisma.pedido.count({ where: { usuarioId: autor.id } }), 0);
      assert.equal(await prisma.direccion.count({ where: { usuarioId: autor.id } }), 0);
      const pedido = await pedidoConEnvio();
      const fila = await historialDe(pedido, { usuarioId: autor.id });

      let error;
      try {
        await prisma.usuario.delete({ where: { id: autor.id } });
      } catch (e) {
        error = e;
      }

      assert.equal(error?.code, "P2003", error?.message);
      assert.match(JSON.stringify(error.meta ?? {}) + error.message, /HistorialEstadoEnvio_usuarioId_fkey/);
      const despues = await prisma.historialEstadoEnvio.findUnique({ where: { id: fila.id } });
      assert.equal(despues.usuarioId, autor.id);
    });

    it("las FKs son ON DELETE RESTRICT (no CASCADE ni SET NULL) según information_schema", async () => {
      const filas = await prisma.$queryRaw`
        SELECT k.COLUMN_NAME AS columna,
               k.REFERENCED_TABLE_NAME AS tabla,
               r.DELETE_RULE AS alBorrar
        FROM information_schema.key_column_usage k
        JOIN information_schema.referential_constraints r
          ON r.constraint_schema = k.constraint_schema
         AND r.constraint_name = k.constraint_name
        WHERE k.table_schema = DATABASE()
          AND k.table_name = 'HistorialEstadoEnvio'
          AND k.REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY k.COLUMN_NAME`;

      assert.deepEqual(
        // MySQL puede devolver el nombre de la tabla en minúsculas según
        // lower_case_table_names: se compara sin distinguir mayúsculas.
        filas.map((f) => [f.columna, String(f.tabla).toLowerCase(), f.alBorrar]),
        [
          ["infoEnvioId", "infoenvio", "RESTRICT"],
          ["usuarioId", "usuario", "RESTRICT"],
        ]
      );
    });
  });

  describe("índices", () => {
    it("existe un índice NO único por (infoEnvioId, creadoEn), en ese orden", async () => {
      const filas = await prisma.$queryRaw`
        SELECT INDEX_NAME AS nombre,
               NON_UNIQUE AS noUnico,
               GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columnas
        FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'HistorialEstadoEnvio'
        GROUP BY INDEX_NAME, NON_UNIQUE`;
      const indices = filas.map((f) => ({
        nombre: f.nombre,
        unico: Number(f.noUnico) === 0,
        columnas: f.columnas,
      }));

      const compuesto = indices.find((i) => i.columnas === "infoEnvioId,creadoEn");
      assert.ok(compuesto, JSON.stringify(indices));
      assert.equal(compuesto.unico, false);
    });
  });

  describe("migración", () => {
    const carpeta = path.join(__dirname, "..", "prisma", "migrations");
    const nombres = () =>
      fs
        .readdirSync(carpeta, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();

    it("existe add_historial_estado_envio con un timestamp POSTERIOR a las migraciones de sprint-5-base", () => {
      const migracion = nombres().find((n) => n.endsWith("_add_historial_estado_envio"));

      assert.ok(migracion, "no existe la migración add_historial_estado_envio");
      assert.match(migracion, /^\d{14}_add_historial_estado_envio$/);
      assert.ok(
        migracion.slice(0, 14) > ULTIMA_MIGRACION_DE_SPRINT_5,
        `${migracion} debe ser posterior a ${ULTIMA_MIGRACION_DE_SPRINT_5}`
      );
    });

    it("es la última de la carpeta, así que el orden de aplicación sigue creciente al juntar las ramas", () => {
      const lista = nombres();
      const migracion = lista.find((n) => n.endsWith("_add_historial_estado_envio"));

      assert.equal(lista.at(-1), migracion);
      assert.deepEqual(lista, [...lista].sort());
      assert.equal(new Set(lista.map((n) => n.slice(0, 14))).size, lista.length, "timestamps repetidos");
    });

    it("crea la tabla sin backfill (no hay datos reales de quién ni cuándo para los envíos existentes)", () => {
      const migracion = nombres().find((n) => n.endsWith("_add_historial_estado_envio"));
      const sql = fs.readFileSync(path.join(carpeta, migracion, "migration.sql"), "utf8");

      assert.match(sql, /CREATE TABLE `HistorialEstadoEnvio`/);
      assert.doesNotMatch(sql, /INSERT\s+INTO/i);
      assert.doesNotMatch(sql, /ON DELETE (CASCADE|SET NULL)/i);
      assert.doesNotMatch(sql, /ALTER TABLE `(InfoEnvio|Usuario|Pedido)`\s+(DROP|MODIFY|CHANGE)/i);
    });
  });
});
