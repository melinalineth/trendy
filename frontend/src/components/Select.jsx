import React from "react";
import "./Select.css";

function Select({
  label,
  name,
  value,
  onChange,
  options = [],
  placeholder = "Selecciona una opción",
  required = false,
  disabled = false,
}) {
  return (
    <div className="select-group">
      {label && (
        <label htmlFor={name} className="select-group__label">
          {label}
        </label>
      )}

      <select
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        className="select-group__select"
      >
        <option value="" disabled>
          {placeholder}
        </option>

        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default Select;