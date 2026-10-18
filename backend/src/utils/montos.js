// Montos en centavos enteros (sin errores de coma flotante).
//
// Módulo HOJA: no importa nada de src/. pedido.service y venta.service lo
// comparten, y entre ellos hay un ciclo de módulos (pedido.service y
// pago.service importan venta.service), así que esta función no puede vivir en
// ninguno de los dos.

// Decimal de Prisma, string o Number (p. ej. el costo de calcularCosto) ->
// centavos enteros. Se parsea el TEXTO con dos decimales (Decimal.toFixed(2))
// en vez de multiplicar floats: "0.10" * 3 da 30 centavos exactos.
function aCentavos(valor) {
  const texto =
    valor !== null && typeof valor === "object" && typeof valor.toFixed === "function"
      ? valor.toFixed(2)
      : String(valor).trim();
  const partes = /^(\d+)(?:\.(\d{1,2}))?$/.exec(texto);

  if (!partes) {
    throw new Error(`Monto inválido: ${texto}`);
  }

  return Number(partes[1]) * 100 + Number((partes[2] ?? "").padEnd(2, "0"));
}

module.exports = {
  aCentavos,
};
