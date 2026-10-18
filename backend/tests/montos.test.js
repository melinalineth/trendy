// Tests de unidad de utils/montos.js (sin base de datos): conversión de un
// monto Decimal(10,2) / texto / número a centavos enteros, sin errores de coma
// flotante. Es el módulo hoja que comparten pedido.service y venta.service.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { Prisma } = require("@prisma/client");
const { aCentavos } = require("../src/utils/montos");

describe("utils/montos.aCentavos", () => {
  it("convierte textos con dos decimales a centavos exactos", () => {
    assert.equal(aCentavos("0.10"), 10);
    assert.equal(aCentavos("0.20"), 20);
    assert.equal(aCentavos("19990.50"), 1999050);
    assert.equal(aCentavos("19990.55"), 1999055);
    assert.equal(aCentavos("0.00"), 0);
  });

  it("completa un solo decimal: '19990.5' son 1999050 centavos", () => {
    assert.equal(aCentavos("19990.5"), 1999050);
    assert.equal(aCentavos("0.1"), 10);
  });

  it("acepta enteros como texto y como número", () => {
    assert.equal(aCentavos("19990"), 1999000);
    assert.equal(aCentavos(19990), 1999000);
    assert.equal(aCentavos(0), 0);
  });

  it("acepta números con decimales sin multiplicar floats", () => {
    // 0.1 + 0.2 en float es 0.30000000000000004; el texto es el que manda.
    assert.equal(aCentavos(0.1), 10);
    assert.equal(aCentavos(0.2), 20);
    assert.equal(aCentavos(19990.55), 1999055);
    assert.equal(aCentavos(59971.65), 5997165);
  });

  it("0.10 + 0.20 suma 30 centavos (no 30.000000000000004)", () => {
    assert.equal(aCentavos("0.10") + aCentavos("0.20"), 30);
  });

  it("acepta el Decimal de Prisma", () => {
    assert.equal(aCentavos(new Prisma.Decimal("19990.55")), 1999055);
    assert.equal(aCentavos(new Prisma.Decimal("0.1")), 10);
    assert.equal(aCentavos(new Prisma.Decimal("12345")), 1234500);
  });

  it("maneja el máximo de Decimal(10,2): 99999999.99", () => {
    assert.equal(aCentavos("99999999.99"), 9999999999);
    assert.equal(aCentavos(new Prisma.Decimal("99999999.99")), 9999999999);
  });

  it("ignora espacios alrededor del texto", () => {
    assert.equal(aCentavos("  19990.50 "), 1999050);
  });

  it("pedido.service sigue exportando la misma función (una sola definición)", () => {
    const pedidoService = require("../src/services/pedido.service");

    assert.equal(pedidoService.aCentavos, aCentavos);
  });

  it("es un módulo hoja: no importa nada de src/", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const fuente = fs.readFileSync(path.join(__dirname, "..", "src", "utils", "montos.js"), "utf8");

    assert.doesNotMatch(fuente, /require\(/);
  });

  it("lanza un error con el valor para montos inválidos", () => {
    for (const valor of ["abc", "", "1.234", "-5", "1,5", null, undefined, NaN]) {
      assert.throws(() => aCentavos(valor), /Monto inválido/, `valor: ${String(valor)}`);
    }
  });
});
