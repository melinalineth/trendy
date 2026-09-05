import React from "react";
import "./Modal.css";

function Modal({
  isOpen,
  onClose,
  title,
  children,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="modal__header">
          <h2 className="modal__title">
            {title}
          </h2>

          <button
            className="modal__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {/* Contenido */}
        <div className="modal__body">
          {children}
        </div>

        {/* Pie */}
        <div className="modal__footer">
          <button
            className="modal__button modal__button--cancel"
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export default Modal;