import { formatearPrecio } from "../orders/pedidoEstados";
import { textoVentas } from "../sales/ventaEstados";
import { etiquetaDia, montoCorto, topeDeEscala } from "./panelInicioUtils";

// Gráfico de barras de las ventas registradas por día (CSS puro, sin
// dependencias). Recibe lo que arma useVentasUltimosDias:
//   dias: [{ fecha, cantidad, total }] (uno por día, del más viejo al nuevo),
//   periodo: { desde, hasta }, incompleto: true si el backend tiene más
//   ventas que las recorridas.
// Alternativa accesible: el gráfico es una imagen con un resumen en texto
// (también visible) y debajo, desplegable, una tabla con los días que tuvieron
// ventas.

// Posiciones (índice del día) donde se rotula el eje horizontal.
function indicesDeRotulos(cantidad) {
  const ultimo = cantidad - 1;
  const pasos = [0, 0.25, 0.5, 0.75, 1];

  return [...new Set(pasos.map((paso) => Math.round(paso * ultimo)))];
}

// Salvedad cuando las cifras pueden no ser exactas (ver `incompleto` en
// useVentasUltimosDias).
const TEXTO_INCOMPLETO =
  "Estas cifras pueden estar incompletas: hay más ventas que las que el gráfico puede recorrer o las ventas cambiaron mientras se cargaban. Recargá la página para ver cifras al día, o usá el listado de ventas.";

function textoResumen(dias, periodo) {
  const ventas = dias.reduce((suma, dia) => suma + dia.cantidad, 0);
  const total = dias.reduce((suma, dia) => suma + dia.total, 0);
  const rango = `del ${etiquetaDia(periodo.desde)} al ${etiquetaDia(periodo.hasta)}`;
  const mejor = dias.reduce((a, b) => (b.total > a.total ? b : a), dias[0]);

  return `Ventas registradas ${rango}: ${textoVentas(ventas)} por ${formatearPrecio(total)}. El día de mayor venta fue el ${etiquetaDia(mejor.fecha)}, con ${formatearPrecio(mejor.total)}.`;
}

export default function GraficoVentas({ dias, periodo, incompleto }) {
  const maximo = Math.max(...dias.map((dia) => dia.total));
  const tope = topeDeEscala(maximo);
  const resumen = textoResumen(dias, periodo);
  // Un solo texto para lectores de pantalla (nombre de la imagen), con la
  // salvedad incluida; los párrafos visibles de abajo van aria-hidden para que
  // no se lea dos veces.
  const nombreAccesible = incompleto
    ? `${resumen} ${TEXTO_INCOMPLETO}`
    : resumen;
  const diasConVentas = dias.filter((dia) => dia.cantidad > 0);
  const rotulos = indicesDeRotulos(dias.length);

  return (
    <div className="panel-inicio__grafico-contenedor">
      <div
        className="panel-inicio__grafico"
        role="img"
        aria-label={nombreAccesible}
      >
        <div className="panel-inicio__grafico-eje-y" aria-hidden="true">
          <span>{montoCorto(tope)}</span>
          <span>{montoCorto(tope / 2)}</span>
          <span>{montoCorto(0)}</span>
        </div>

        <div className="panel-inicio__grafico-area">
          <div className="panel-inicio__grafico-lineas" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <div className="panel-inicio__grafico-barras" aria-hidden="true">
            {dias.map((dia) => (
              <div
                key={dia.fecha}
                className="panel-inicio__grafico-columna"
                title={`${etiquetaDia(dia.fecha)}: ${formatearPrecio(dia.total)} (${textoVentas(dia.cantidad)})`}
              >
                {dia.total > 0 && (
                  <span
                    className="panel-inicio__grafico-barra"
                    style={{ height: `${(dia.total / tope) * 100}%` }}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="panel-inicio__grafico-eje-x" aria-hidden="true">
            {rotulos.map((indice) => (
              <span key={dias[indice].fecha}>{etiquetaDia(dias[indice].fecha)}</span>
            ))}
          </div>
        </div>
      </div>

      <p className="panel-inicio__grafico-resumen" aria-hidden="true">
        {resumen}
      </p>

      {incompleto && (
        <p className="panel-inicio__grafico-aviso" aria-hidden="true">
          {TEXTO_INCOMPLETO}
        </p>
      )}

      <details className="panel-inicio__grafico-tabla">
        <summary>Ver los datos del gráfico en una tabla</summary>

        <div className="table-wrapper">
          <table className="table">
            <caption className="panel-inicio__sr-only">
              Ventas registradas por día (solo los días con ventas)
            </caption>
            <thead>
              <tr>
                <th scope="col">Día</th>
                <th scope="col">Ventas</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {diasConVentas.map((dia) => (
                <tr key={dia.fecha}>
                  <th scope="row">{etiquetaDia(dia.fecha)}</th>
                  <td>{dia.cantidad}</td>
                  <td>{formatearPrecio(dia.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="panel-inicio__grafico-nota">
          Los días sin ventas no aparecen en la tabla.
          {incompleto && " Las cifras pueden estar incompletas."}
        </p>
      </details>
    </div>
  );
}
