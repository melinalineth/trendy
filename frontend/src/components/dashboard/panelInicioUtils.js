// Cálculos puros de los paneles de inicio de admin y vendedor: fechas en la
// zona de la tienda (America/Bogota, la misma con la que el backend interpreta
// `desde`/`hasta`, docs/diseno/ventas-api.md §2) y agrupación de ventas por
// día para el gráfico de «Ventas de los últimos 30 días».

const ZONA_TIENDA = "America/Bogota";

// Los días se restan sobre fechas calendario en UTC (medianoche UTC de cada
// día de Bogotá), así que cada uno mide exactamente 24 h.
const MS_POR_DIA = 24 * 60 * 60 * 1000;

// "AAAA-MM-DD" del día de Bogotá en el que cae un instante. El locale
// "en-CA" formatea justo como AAAA-MM-DD.
export function fechaBogota(instante) {
  const valor = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(valor.getTime())) return "";

  return valor.toLocaleDateString("en-CA", { timeZone: ZONA_TIENDA });
}

function aUtc(fechaTexto) {
  const [anio, mes, dia] = fechaTexto.split("-").map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

function deUtc(milisegundos) {
  return new Date(milisegundos).toISOString().slice(0, 10);
}

// Los últimos `cantidad` días de Bogotá incluyendo hoy, del más viejo al más
// nuevo. Devuelve { desde, hasta, dias } con `desde`/`hasta` listos para
// GET /ventas y `dias` como arreglo de "AAAA-MM-DD".
export function rangoUltimosDias(cantidad = 30, ahora = new Date()) {
  const hoy = aUtc(fechaBogota(ahora));
  const dias = [];

  for (let atras = cantidad - 1; atras >= 0; atras -= 1) {
    dias.push(deUtc(hoy - atras * MS_POR_DIA));
  }

  return { desde: dias[0], hasta: dias[dias.length - 1], dias };
}

// Suma las ventas por día de Bogotá. Cada elemento del resultado es
// { fecha, cantidad, total } y hay uno por cada día de `dias`, aunque no haya
// habido ventas (cantidad 0, total 0). Las ventas fuera de `dias` se ignoran.
export function agruparVentasPorDia(ventas, dias) {
  const porDia = new Map(
    dias.map((fecha) => [fecha, { fecha, cantidad: 0, total: 0 }]),
  );

  ventas.forEach((venta) => {
    const dia = porDia.get(fechaBogota(venta.fecha));
    if (!dia) return;

    dia.cantidad += 1;
    dia.total += Number(venta.total ?? 0);
  });

  return dias.map((fecha) => porDia.get(fecha));
}

// Tope «redondo» para el eje vertical (1, 2, 5 o 10 por una potencia de 10)
// que deja a `maximo` dentro de la escala. 0 si no hay nada que dibujar.
export function topeDeEscala(maximo) {
  if (!(maximo > 0)) return 0;

  const potencia = 10 ** Math.floor(Math.log10(maximo));
  const mantisa = maximo / potencia;
  const paso = [1, 2, 5, 10].find((candidato) => mantisa <= candidato);

  return paso * potencia;
}

// "5 oct" a partir de "2026-10-05" (sin depender de la zona horaria local).
export function etiquetaDia(fecha) {
  return new Date(aUtc(fecha))
    .toLocaleDateString("es-CO", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
    })
    .replace(" de ", " ");
}

// Monto corto para el eje del gráfico: "$ 500 mil", "$ 1,5 M". Se arma a mano
// (no con notation: "compact") para que se vea igual en todos los navegadores.
export function montoCorto(valor) {
  const numero = Number(valor ?? 0);

  if (numero >= 1_000_000) {
    const millones = (numero / 1_000_000).toLocaleString("es-CO", {
      maximumFractionDigits: 1,
    });
    return `$ ${millones} M`;
  }

  if (numero >= 1000) return `$ ${Math.round(numero / 1000)} mil`;

  return `$ ${Math.round(numero)}`;
}
