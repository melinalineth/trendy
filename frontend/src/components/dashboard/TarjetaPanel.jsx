import { useId } from "react";
import { Link } from "react-router-dom";

import { ErrorDeCarga, Esqueleto } from "./EstadoDeCarga";

// Tarjeta de una sección del panel de inicio (gráfico, listas de recientes).
// Resuelve los cuatro estados en el mismo recuadro, con la misma altura mínima
// para que el contenido no salte al llegar los datos:
//   - cargando: esqueleto con `filasEsqueleto` barras,
//   - error: mensaje con «Reintentar» de esa fuente,
//   - vacío: `estaVacio(datos)` es true -> `mensajeVacio`,
//   - con datos: `children(datos)`.
// `esGrafico` ajusta la altura mínima al gráfico en vez de a una tabla.
// `enlace` es { to, texto, ariaLabel } (el «Ver todos» del mapa de pantallas).
export default function TarjetaPanel({
  titulo,
  descripcion,
  enlace,
  fuente,
  estaVacio,
  mensajeVacio,
  filasEsqueleto = 6,
  esGrafico = false,
  children,
}) {
  const idTitulo = useId();
  const { datos, cargando, error, recargar } = fuente;
  const hayDatos = !cargando && !error && datos !== null;

  return (
    <section
      className="panel-inicio__tarjeta"
      aria-labelledby={idTitulo}
      aria-busy={cargando}
    >
      <header className="panel-inicio__tarjeta-cabecera">
        <div>
          <h3 id={idTitulo}>{titulo}</h3>
          {descripcion && <p>{descripcion}</p>}
        </div>

        {enlace && (
          <Link
            className="panel-inicio__ver-todos"
            to={enlace.to}
            aria-label={enlace.ariaLabel}
          >
            {enlace.texto}
          </Link>
        )}
      </header>

      <div
        className={
          esGrafico
            ? "panel-inicio__tarjeta-cuerpo panel-inicio__tarjeta-cuerpo--grafico"
            : "panel-inicio__tarjeta-cuerpo"
        }
      >
        {cargando && (
          <Esqueleto
            filas={filasEsqueleto}
            texto={`Cargando ${titulo.toLowerCase()}...`}
          />
        )}

        {!cargando && error && (
          <ErrorDeCarga mensaje={error} onReintentar={recargar} />
        )}

        {hayDatos && estaVacio(datos) && (
          <p className="panel-inicio__vacio">{mensajeVacio}</p>
        )}

        {hayDatos && !estaVacio(datos) && children(datos)}
      </div>
    </section>
  );
}
