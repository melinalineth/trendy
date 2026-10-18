import "./QuantitySelector.css";

// `disabled` bloquea ambos botones (ej. mientras hay una request en curso) y
// `label` completa el nombre accesible de los botones ("Aumentar cantidad
// de Chaqueta"), que de otro modo solo tendrían "−" y "+" como texto.
function QuantitySelector({
  quantity,
  onChange,
  min = 1,
  max = 99,
  disabled = false,
  label = "",
}) {
  const decrease = () => {
    if (quantity > min) {
      onChange(quantity - 1);
    }
  };

  const increase = () => {
    if (quantity < max) {
      onChange(quantity + 1);
    }
  };

  return (
    <div className="quantity-selector">
      <button
        type="button"
        className="quantity-selector__button"
        onClick={decrease}
        disabled={disabled || quantity <= min}
        aria-label={`Disminuir cantidad${label ? ` de ${label}` : ""}`}
      >
        −
      </button>

      <span className="quantity-selector__value" aria-live="polite">
        {quantity}
      </span>

      <button
        type="button"
        className="quantity-selector__button"
        onClick={increase}
        disabled={disabled || quantity >= max}
        aria-label={`Aumentar cantidad${label ? ` de ${label}` : ""}`}
      >
        +
      </button>
    </div>
  );
}

export default QuantitySelector;