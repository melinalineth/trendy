import React from "react";
import "./Loading.css";

function Loading({ text = "Cargando..." }) {
  return (
    <div className="loading">
      <div className="loading__spinner"></div>

      <p className="loading__text">
        {text}
      </p>
    </div>
  );
}

export default Loading;