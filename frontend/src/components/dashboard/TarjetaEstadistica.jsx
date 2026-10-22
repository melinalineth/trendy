import { ErrorDeCarga, Esqueleto } from "./EstadoDeCarga";

// Tarjeta de una cifra del panel de inicio. `fuente` es el resultado de uno de
// los hooks de usePanelInicio ({ datos, cargando, error, recargar }) y
// `contenido(datos)` devuelve { valor, detalle } cuando ya hay datos. Va dentro
// de una <dl>: el título es el <dt> y la cifra con su detalle el <dd>.
export default function TarjetaEstadistica({
  titulo,
  color,
  icono,
  fuente,
  contenido,
}) {
  const { datos, cargando, error, recargar } = fuente;
  const resumen = !cargando && !error && datos !== null ? contenido(datos) : null;

  return (
    <div className="panel-inicio__stat" aria-busy={cargando}>
      <span
        className={`panel-inicio__stat-icono panel-inicio__stat-icono--${color}`}
        aria-hidden="true"
      >
        {icono}
      </span>

      <div className="panel-inicio__stat-cuerpo">
        <dt className="panel-inicio__stat-titulo">{titulo}</dt>

        <dd className="panel-inicio__stat-dato">
          {cargando && <Esqueleto texto={`Cargando ${titulo.toLowerCase()}...`} />}

          {!cargando && error && (
            <ErrorDeCarga mensaje={error} onReintentar={recargar} />
          )}

          {resumen && (
            <>
              <strong className="panel-inicio__stat-valor">{resumen.valor}</strong>
              <span className="panel-inicio__stat-detalle">{resumen.detalle}</span>
            </>
          )}
        </dd>
      </div>
    </div>
  );
}
