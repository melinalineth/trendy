import Button from "../common/Button";

// Estados de carga y de error que comparten todas las tarjetas del panel de
// inicio. Cada tarjeta los muestra DENTRO de sí misma: que una petición falle
// no tumba el resto del panel.

// Texto solo para lectores de pantalla (misma técnica que SalesPanel).
export function SoloLectores({ children }) {
  return <span className="panel-inicio__sr-only">{children}</span>;
}

// Placeholder animado mientras llega el dato. `filas` > 0 dibuja barras
// apiladas (para tablas); sin `filas`, una línea corta (para una cifra).
export function Esqueleto({ filas = 0, texto = "Cargando..." }) {
  const barras = filas > 0 ? Array.from({ length: filas }, (_, i) => i) : [0];

  return (
    <div
      className={
        filas > 0
          ? "panel-inicio__esqueleto panel-inicio__esqueleto--filas"
          : "panel-inicio__esqueleto"
      }
    >
      {barras.map((indice) => (
        <span
          key={indice}
          className="panel-inicio__esqueleto-barra"
          aria-hidden="true"
        />
      ))}
      <SoloLectores>{texto}</SoloLectores>
    </div>
  );
}

// Mensaje de error de una tarjeta con su botón para reintentar solo esa
// petición.
export function ErrorDeCarga({ mensaje, onReintentar }) {
  return (
    <div className="panel-inicio__error" role="alert">
      <p>{mensaje}</p>
      <Button
        className="panel-inicio__btn-secundario"
        text="Reintentar"
        onClick={onReintentar}
      />
    </div>
  );
}
