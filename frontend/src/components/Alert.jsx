import React from "react";
import "./Alert.css";

function Alert({ message, type = "info", onClose }) {
  return (
    <div className={`alert alert--${type}`}>
      <span className="alert__message">{message}</span>

      {onClose && (
        <button className="alert__close" onClick={onClose}>
          ×
        </button>
      )}
    </div>
  );
}

export default Alert;