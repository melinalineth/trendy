import React from "react";
import "./QuantitySelector.css";

function QuantitySelector({ quantity, onChange, min = 1, max = 99 }) {
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
        className="quantity-selector__button"
        onClick={decrease}
        disabled={quantity <= min}
      >
        −
      </button>

      <span className="quantity-selector__value">
        {quantity}
      </span>

      <button
        className="quantity-selector__button"
        onClick={increase}
        disabled={quantity >= max}
      >
        +
      </button>
    </div>
  );
}

export default QuantitySelector;