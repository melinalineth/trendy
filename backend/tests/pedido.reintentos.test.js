// Tests unitarios (sin base) del predicado que decide si una transacción de
// pedidos se reintenta (pedido.service.esErrorReintentable). Las formas de
// los errores son las reales de Prisma 7 con @prisma/adapter-mariadb
// (verificadas contra MySQL): el deadlock de una query del cliente llega como
// P2034, pero dentro de un $queryRaw (los SELECT ... FOR UPDATE) llega como
// P2010 con el código de MySQL; el unique violado llega como P2002 con el
// índice en meta.driverAdapterError (sin meta.target).
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { esErrorReintentable } = require("../src/services/pedido.service");

function errorPrisma(code, meta, message = "error de prueba") {
  const error = new Error(message);
  error.code = code;
  if (meta !== undefined) error.meta = meta;
  return error;
}

const crudo = (codigoMysql) =>
  errorPrisma(
    "P2010",
    {
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: { originalCode: codigoMysql, originalMessage: "x", kind: "GenericJs" },
      },
    },
    `Invalid \`prisma.$queryRaw()\` invocation:\n\nRaw query failed. Code: \`${codigoMysql}\`. Message: \`x\``
  );

const uniqueAdapter = (indice) =>
  errorPrisma("P2002", {
    driverAdapterError: {
      name: "DriverAdapterError",
      cause: {
        originalCode: "1062",
        kind: "UniqueConstraintViolation",
        constraint: { index: indice },
        table: "pedido",
      },
    },
    modelName: "Pedido",
  });

describe("esErrorReintentable (reintentos de transacciones de pedidos)", () => {
  it("P2034 (deadlock / conflicto de escritura) se reintenta", () => {
    assert.equal(esErrorReintentable(errorPrisma("P2034")), true);
  });

  it("P2010 de SQL crudo con deadlock (1213) o lock wait timeout (1205) se reintenta", () => {
    assert.equal(esErrorReintentable(crudo("1213")), true);
    assert.equal(esErrorReintentable(crudo("1205")), true);
  });

  it("P2010 con el código solo en el mensaje (sin meta) también se reconoce", () => {
    const error = errorPrisma("P2010", undefined, "Raw query failed. Code: `1213`. Message: `Deadlock found`");
    assert.equal(esErrorReintentable(error), true);
  });

  it("P2010 con OTRO código de MySQL no se reintenta", () => {
    assert.equal(esErrorReintentable(crudo("1146")), false);
    assert.equal(esErrorReintentable(crudo("12130")), false);
    const error = errorPrisma("P2010", undefined, "Raw query failed. Code: `1064`. Message: `syntax`");
    assert.equal(esErrorReintentable(error), false);
  });

  it("P2002 del unique de Pedido.numero se reintenta SOLO si se pidió (creación)", () => {
    assert.equal(esErrorReintentable(uniqueAdapter("Pedido_numero_key"), { reintentarUnique: true }), true);
    assert.equal(esErrorReintentable(uniqueAdapter("Pedido_numero_key")), false);
    // Formas del motor sin adapter (meta.target).
    assert.equal(
      esErrorReintentable(errorPrisma("P2002", { target: ["numero"] }), { reintentarUnique: true }),
      true
    );
    assert.equal(
      esErrorReintentable(errorPrisma("P2002", { target: "Pedido_numero_key" }), { reintentarUnique: true }),
      true
    );
  });

  it("P2002 de OTRO unique (o sin datos del índice) no se reintenta", () => {
    for (const error of [
      uniqueAdapter("InfoEnvio_pedidoId_key"),
      uniqueAdapter("Pago_pedidoId_key"),
      errorPrisma("P2002", { target: ["pedidoId"] }),
      errorPrisma("P2002"),
    ]) {
      assert.equal(esErrorReintentable(error, { reintentarUnique: true }), false);
    }
  });

  it("cualquier otro error no se reintenta", () => {
    for (const error of [
      new Error("cualquiera"),
      errorPrisma("P2025"),
      Object.assign(new Error("dominio"), { status: 409, codigo: "STOCK_INSUFICIENTE" }),
      null,
      undefined,
    ]) {
      assert.equal(esErrorReintentable(error, { reintentarUnique: true }), false);
    }
  });
});
