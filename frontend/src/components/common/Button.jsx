import "./Button.css";

function Button({
  text,
  onClick,
  type = "button",
  className = "",
  disabled = false,
  ariaLabel,
}) {
  return (
    <button
      type={type}
      className={`btn ${className}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {text}
    </button>
  );
}

export default Button;