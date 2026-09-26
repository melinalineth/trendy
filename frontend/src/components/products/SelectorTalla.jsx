import { useState } from "react";
import "./SelectorTalla.css";

// Selector de talla/color del detalle de producto (RF-012): cada variante
// del contrato de /api/v1/productos/:id se muestra como una opción propia
// (talla + color) porque el stock y la disponibilidad son por variante, no
// por producto. Las variantes sin stock se muestran deshabilitadas en vez
// de ocultarse, para que la persona vea todo el surtido real antes de
// elegir.
function SelectorTalla({ variantes = [], onSelect }) {
  const [seleccionadaId, setSeleccionadaId] = useState(null);

  if (variantes.length === 0) {
    return (
      <p className="selector-talla__vacio">
        No hay variantes disponibles para este producto.
      </p>
    );
  }

  const handleSelect = (variante) => {
    if (!variante.disponible) return;

    setSeleccionadaId(variante.id);
    onSelect?.(variante);
  };

  return (
    <div className="selector-talla">
      <span className="selector-talla__label">Talla y color</span>

      <div className="selector-talla__opciones">
        {variantes.map((variante) => (
          <button
            key={variante.id}
            type="button"
            className={`selector-talla__opcion ${
              seleccionadaId === variante.id
                ? "selector-talla__opcion--activa"
                : ""
            }`}
            disabled={!variante.disponible}
            aria-pressed={seleccionadaId === variante.id}
            onClick={() => handleSelect(variante)}
          >
            {variante.talla} · {variante.color}
            {!variante.disponible && (
              <span className="selector-talla__agotado"> (agotado)</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default SelectorTalla;
