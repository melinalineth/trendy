import { ErrorDeCarga, Esqueleto } from "./EstadoDeCarga";

// Tarjeta de una cifra del panel de inicio. `fuente` es el resultado de uno de
// los hooks de usePanelInicio ({ datos, cargando, error, recargar }) y
// `contenido(datos)` devuelve { valor, detalle } cuando ya hay datos.
//
// Va dentro de una <dl>. Para que el HTML sea válido, el <div> de cada tarjeta
// solo contiene <dt> y <dd>: el título es el <dt>, el ícono decorativo un <dd>
// aria-hidden (lo leen solo los ojos) y la cifra con su detalle el otro <dd>.
// La grilla del CSS los acomoda como ícono | título sobre cifra.
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
      <dt className="panel-inicio__stat-titulo">{titulo}</dt>

      <dd
        className={`panel-inicio__stat-icono panel-inicio__stat-icono--${color}`}
        aria-hidden="true"
      >
        {icono}
      </dd>

      <dd className="panel-inicio__stat-dato">
        {cargando && <Esqueleto texto={`Cargando ${titulo.toLowerCase()}...`} />}

        {!cargando && error && (
          <ErrorDeCarga titulo={titulo} mensaje={error} onReintentar={recargar} />
        )}

        {resumen && (
          <>
            <strong className="panel-inicio__stat-valor">{resumen.valor}</strong>
            <span className="panel-inicio__stat-detalle">{resumen.detalle}</span>
          </>
        )}
      </dd>
    </div>
  );
}
