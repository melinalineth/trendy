import "./Input.css";

function Input({
  type = "text",
  placeholder,
  value,
  onChange,
  name,
  step,
}) {
  return (
    <input
      className="input-task"
      type={type}
      name={name}
      step={step}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  );
}

export default Input;