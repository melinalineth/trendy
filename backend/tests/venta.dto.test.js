// Tests de unidad del DTO de filtros de la consulta de ventas (RF-042). No usan
// base de datos. Contrato: docs/diseno/ventas-api.md.
//
//   - desde / hasta: YYYY-MM-DD INCLUSIVOS en hora de Bogotá (UTC-5, sin DST).
//     El DTO entrega `desde` (00:00:00.000 -05:00) y `hastaExclusivo` (00:00 de
//     Bogotá del día siguiente), que es lo mismo que "hasta 23:59:59.999".
//   - rango máximo de 366 días, desde <= hasta.
//   - parámetros desconocidos, repetidos, vacíos o mal formados -> 400
//     VALIDACION_FALLIDA (el código de todo el proyecto) con `detalles` (arreglo de textos en español).
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { validarFiltrosVentas } = require("../src/dtos/venta.dto");

// Devuelve el error que lanza validarFiltrosVentas(query) (falla si no lanza).
function errorDe(query) {
  try {
    validarFiltrosVentas(query);
  } catch (error) {
    return error;
  }
  assert.fail(`se esperaba un 400 para ${JSON.stringify(query)}`);
}

function assertFiltrosInvalidos(query, patron) {
  const error = errorDe(query);
  assert.equal(error.status, 400);
  assert.equal(error.codigo, "VALIDACION_FALLIDA");
  assert.ok(Array.isArray(error.detalles) && error.detalles.length > 0);
  assert.ok(error.detalles.every((d) => typeof d === "string" && d.length > 0));
  // Sin punto final: el frontend une los detalles con ". ".
  assert.ok(
    error.detalles.every((d) => !d.trimEnd().endsWith(".")),
    JSON.stringify(error.detalles)
  );
  assert.match(error.detalles.join(" | "), patron);
  return error;
}

describe("DTO de filtros de ventas (RF-042)", () => {
  describe("defaults", () => {
    it("sin filtros: pagina 1, limite 50 y sin fechas ni estado", () => {
      const filtros = validarFiltrosVentas({});

      assert.equal(filtros.pagina, 1);
      assert.equal(filtros.limite, 50);
      assert.equal(filtros.estado, undefined);
      assert.equal(filtros.desde, undefined);
      assert.equal(filtros.hastaExclusivo, undefined);
    });
  });

  describe("fechas en hora de Bogotá", () => {
    it("desde es la medianoche de Bogotá de ese día (05:00 UTC)", () => {
      const { desde } = validarFiltrosVentas({ desde: "2026-10-31" });

      assert.ok(desde instanceof Date);
      assert.equal(desde.toISOString(), "2026-10-31T05:00:00.000Z");
    });

    it("hasta es inclusivo: el límite exclusivo es la medianoche de Bogotá del día siguiente", () => {
      const { hastaExclusivo } = validarFiltrosVentas({ hasta: "2026-10-31" });

      assert.ok(hastaExclusivo instanceof Date);
      assert.equal(hastaExclusivo.toISOString(), "2026-11-01T05:00:00.000Z");
    });

    it("hasta 31/12 cruza de año: el límite exclusivo es el 01/01 siguiente", () => {
      const { hastaExclusivo } = validarFiltrosVentas({ hasta: "2026-12-31" });

      assert.equal(hastaExclusivo.toISOString(), "2027-01-01T05:00:00.000Z");
    });

    it("años bisiestos: hasta 28/02 de un año común va al 01/03; en un bisiesto, al 29/02", () => {
      assert.equal(
        validarFiltrosVentas({ hasta: "2027-02-28" }).hastaExclusivo.toISOString(),
        "2027-03-01T05:00:00.000Z"
      );
      assert.equal(
        validarFiltrosVentas({ hasta: "2028-02-28" }).hastaExclusivo.toISOString(),
        "2028-02-29T05:00:00.000Z"
      );
      assert.equal(
        validarFiltrosVentas({ hasta: "2028-02-29" }).hastaExclusivo.toISOString(),
        "2028-03-01T05:00:00.000Z"
      );
    });

    it("rechaza el 29/02 de un año común y otras fechas inexistentes del calendario", () => {
      for (const valor of ["2027-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-10"]) {
        assertFiltrosInvalidos({ desde: valor }, /desde.*(fecha|calendario)/i);
        assertFiltrosInvalidos({ hasta: valor }, /hasta.*(fecha|calendario)/i);
      }
    });

    it("rechaza formatos que no son YYYY-MM-DD", () => {
      for (const valor of ["2026-1-5", "31/10/2026", "2026-10-31T00:00:00Z", "hoy", "20261031"]) {
        assertFiltrosInvalidos({ desde: valor }, /YYYY-MM-DD/);
        assertFiltrosInvalidos({ hasta: valor }, /YYYY-MM-DD/);
      }
    });

    it("desde posterior a hasta es un error; desde igual a hasta (un solo día) es válido", () => {
      assertFiltrosInvalidos(
        { desde: "2026-10-31", hasta: "2026-10-30" },
        /desde no puede ser posterior a hasta/
      );

      const { desde, hastaExclusivo } = validarFiltrosVentas({
        desde: "2026-10-31",
        hasta: "2026-10-31",
      });
      assert.equal(hastaExclusivo.getTime() - desde.getTime(), 24 * 60 * 60 * 1000);
    });

    it("el rango máximo es de 366 días inclusivos", () => {
      // 2028 es bisiesto: del 01/01 al 31/12 hay exactamente 366 días.
      assert.doesNotThrow(() => validarFiltrosVentas({ desde: "2028-01-01", hasta: "2028-12-31" }));
      // 01/01/2026 al 01/01/2027: 366 días inclusivos (365 + 1).
      assert.doesNotThrow(() => validarFiltrosVentas({ desde: "2026-01-01", hasta: "2027-01-01" }));
      // Un día más: 367.
      assertFiltrosInvalidos(
        { desde: "2026-01-01", hasta: "2027-01-02" },
        /no puede superar 366 días/
      );
      assertFiltrosInvalidos(
        { desde: "2028-01-01", hasta: "2029-01-01" },
        /no puede superar 366 días/
      );
    });

    // Años absurdos: antes producían "Invalid Date" (templates sin padStart) que
    // llegaba a Prisma. Se aceptan solo años 2000..2100.
    it("rechaza años fuera de 2000..2100 con un detalle claro (sin Invalid Date)", () => {
      for (const valor of ["9999-12-31", "0100-01-01", "1999-12-31", "2101-01-01"]) {
        assertFiltrosInvalidos({ desde: valor }, /desde.*2000.*2100/);
        assertFiltrosInvalidos({ hasta: valor }, /hasta.*2000.*2100/);
      }
    });

    it("acepta los bordes de años: 2000-01-01 y 2100-12-31, con instantes válidos", () => {
      const { desde } = validarFiltrosVentas({ desde: "2000-01-01" });
      assert.equal(desde.toISOString(), "2000-01-01T05:00:00.000Z");

      const { hastaExclusivo } = validarFiltrosVentas({ hasta: "2100-12-31" });
      assert.equal(hastaExclusivo.toISOString(), "2101-01-01T05:00:00.000Z");

      const ambos = validarFiltrosVentas({ desde: "2100-01-01", hasta: "2100-12-31" });
      assert.ok(!Number.isNaN(ambos.desde.getTime()));
      assert.ok(!Number.isNaN(ambos.hastaExclusivo.getTime()));
    });

    it("con una sola de las dos fechas no hay límite de rango", () => {
      assert.doesNotThrow(() => validarFiltrosVentas({ desde: "2000-01-01" }));
      assert.doesNotThrow(() => validarFiltrosVentas({ hasta: "2099-12-31" }));
    });
  });

  describe("estado", () => {
    it("acepta REGISTRADA y ANULADA", () => {
      assert.equal(validarFiltrosVentas({ estado: "REGISTRADA" }).estado, "REGISTRADA");
      assert.equal(validarFiltrosVentas({ estado: "ANULADA" }).estado, "ANULADA");
    });

    it("rechaza otros valores (incluidos minúsculas, vacío y estados de pedido)", () => {
      for (const valor of ["registrada", "", "CANCELADO", "PENDIENTE", "todas"]) {
        assertFiltrosInvalidos({ estado: valor }, /estado debe ser uno de.*REGISTRADA, ANULADA/);
      }
    });
  });

  describe("paginación", () => {
    it("acepta pagina >= 1 y limite entre 1 y 100", () => {
      const filtros = validarFiltrosVentas({ pagina: "3", limite: "100" });
      assert.equal(filtros.pagina, 3);
      assert.equal(filtros.limite, 100);
      assert.equal(validarFiltrosVentas({ limite: "1" }).limite, 1);
    });

    it("rechaza pagina fuera de rango o no entera", () => {
      for (const valor of ["0", "-1", "1.5", "abc", "", "1e2", " 2", "100001"]) {
        assertFiltrosInvalidos({ pagina: valor }, /pagina/);
      }
    });

    it("rechaza limite fuera de 1..100 o no entero", () => {
      for (const valor of ["0", "101", "-5", "1.5", "diez", "", "1e1"]) {
        assertFiltrosInvalidos({ limite: valor }, /limite/);
      }
    });
  });

  describe("parámetros inesperados", () => {
    it("rechaza parámetros desconocidos y los nombra", () => {
      const error = assertFiltrosInvalidos({ foo: "1", usuarioId: "3" }, /foo/);
      assert.match(error.detalles.join(" | "), /usuarioId/);
    });

    it("rechaza un parámetro repetido (llega como arreglo)", () => {
      for (const campo of ["desde", "hasta", "estado", "pagina", "limite"]) {
        assertFiltrosInvalidos({ [campo]: ["1", "2"] }, new RegExp(campo));
      }
    });

    it("rechaza valores que no son texto (objetos de la query anidada)", () => {
      assertFiltrosInvalidos({ estado: { a: "ANULADA" } }, /estado/);
      assertFiltrosInvalidos({ pagina: { a: "1" } }, /pagina/);
      assertFiltrosInvalidos({ desde: { a: "2026-01-01" } }, /desde/);
    });

    it("rechaza valores vacíos en cada filtro", () => {
      for (const campo of ["desde", "hasta", "estado", "pagina", "limite"]) {
        assertFiltrosInvalidos({ [campo]: "" }, new RegExp(campo));
      }
    });
  });

  describe("formato del error", () => {
    it("acumula todos los problemas en `detalles` (textos en español)", () => {
      const error = errorDe({ desde: "mal", estado: "x", pagina: "0", limite: "500", otro: "1" });

      assert.equal(error.status, 400);
      assert.equal(error.codigo, "VALIDACION_FALLIDA");
      assert.ok(error.detalles.every((d) => !d.endsWith(".")), JSON.stringify(error.detalles));
      assert.equal(typeof error.message, "string");
      assert.ok(error.detalles.length >= 5, JSON.stringify(error.detalles));
      assert.ok(error.detalles.every((d) => typeof d === "string"));
    });
  });
});
