// Reglas puras de cancelación de pedidos: qué estados se cancelan según el
// método de pago (esCancelable) y qué mensaje recibe el 409 cuando no
// (mensajeNoCancelable). Sin base: tabla estado x método de pago.
// El flujo completo (lock, stock, venta, Pago) está en venta.registro.http.test.js
// y pedido.cancelar.http.test.js. Reglas: docs/diseno/pedidos-estados.md §6.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  esCancelable,
  mensajeNoCancelable,
  ESTADOS_CANCELABLES,
  ESTADOS_CANCELABLES_CONTRA_ENTREGA,
} = require("../src/services/pedido.service");

const ESTADOS = [
  "PENDIENTE",
  "PAGO_APROBADO",
  "CONFIRMADO",
  "EN_PREPARACION",
  "ENVIADO",
  "EN_TRANSITO",
  "ENTREGADO",
  "CANCELADO",
  "PAGO_RECHAZADO",
  "PAGO_PENDIENTE",
];

// estado -> [MERCADO_PAGO, CONTRA_ENTREGA]
const ESPERADO = {
  PENDIENTE: [true, true],
  PAGO_PENDIENTE: [true, true],
  PAGO_RECHAZADO: [true, true],
  CONFIRMADO: [false, true],
  EN_PREPARACION: [false, true],
  ENVIADO: [false, true],
  EN_TRANSITO: [false, true],
  ENTREGADO: [false, false],
  CANCELADO: [false, false],
  PAGO_APROBADO: [false, false],
};

describe("Cancelabilidad de pedidos (esCancelable / mensajeNoCancelable)", () => {
  it("la tabla de casos cubre todos los estados del enum", () => {
    assert.deepEqual(Object.keys(ESPERADO).sort(), [...ESTADOS].sort());
  });

  describe("esCancelable(estado, metodoPago)", () => {
    for (const estado of ESTADOS) {
      it(`${estado}: Mercado Pago ${ESPERADO[estado][0]}, contra entrega ${ESPERADO[estado][1]}`, () => {
        assert.equal(esCancelable(estado, "MERCADO_PAGO"), ESPERADO[estado][0]);
        assert.equal(esCancelable(estado, "CONTRA_ENTREGA"), ESPERADO[estado][1]);
      });
    }

    it("un método de pago desconocido o ausente solo cancela los estados pendientes de pago", () => {
      for (const metodo of [undefined, null, "EFECTIVO"]) {
        for (const estado of ESTADOS) {
          assert.equal(esCancelable(estado, metodo), ESTADOS_CANCELABLES.includes(estado), `${estado} ${metodo}`);
        }
      }
    });

    it("las listas exportadas son inmutables y ENTREGADO no está en ninguna", () => {
      assert.ok(Object.isFrozen(ESTADOS_CANCELABLES));
      assert.ok(Object.isFrozen(ESTADOS_CANCELABLES_CONTRA_ENTREGA));
      assert.ok(!ESTADOS_CANCELABLES.includes("ENTREGADO"));
      assert.ok(!ESTADOS_CANCELABLES_CONTRA_ENTREGA.includes("ENTREGADO"));
    });
  });

  describe("mensajeNoCancelable(estado, metodoPago)", () => {
    it("ENTREGADO (cualquier método): dice que ya se entregó", () => {
      for (const metodo of ["MERCADO_PAGO", "CONTRA_ENTREGA"]) {
        assert.match(mensajeNoCancelable("ENTREGADO", metodo), /ya entregado/);
      }
    });

    it("Mercado Pago en CONFIRMADO..EN_TRANSITO: explica que está pagado y que el reembolso queda fuera del sistema", () => {
      for (const estado of ["CONFIRMADO", "EN_PREPARACION", "ENVIADO", "EN_TRANSITO"]) {
        const mensaje = mensajeNoCancelable(estado, "MERCADO_PAGO");
        assert.match(mensaje, /Mercado Pago/, estado);
        assert.match(mensaje, /reembolso/, estado);
        assert.ok(mensaje.includes(estado), mensaje);
      }
    });

    it("el estado legado PAGO_APROBADO (sin Pago registrado), CANCELADO y los demás casos reciben el mensaje genérico, sin hablar de reembolso", () => {
      const casos = [
        ["PAGO_APROBADO", "MERCADO_PAGO"],
        ["PAGO_APROBADO", "CONTRA_ENTREGA"],
        ["CANCELADO", "MERCADO_PAGO"],
        ["CANCELADO", "CONTRA_ENTREGA"],
      ];
      for (const [estado, metodo] of casos) {
        const mensaje = mensajeNoCancelable(estado, metodo);
        assert.ok(mensaje.includes(estado), mensaje);
        assert.match(mensaje, /solo se cancelan pedidos pendientes de pago/, `${estado} ${metodo}`);
        assert.doesNotMatch(mensaje, /reembolso/, `${estado} ${metodo}`);
      }
    });
  });
});
