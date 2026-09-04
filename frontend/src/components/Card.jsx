import React from "react";
import "./Card.css";

function Card({
  image,
  title,
  description,
  price,
  buttonText = "Ver producto",
  onClick,
}) {
  return (
    <div className="card">

      {/* Imagen */}
      <div className="card__image-container">
        <img
          src={image}
          alt={title}
          className="card__image"
        />
      </div>

      {/* Información */}
      <div className="card__content">

        <h3 className="card__title">
          {title}
        </h3>

        {description && (
          <p className="card__description">
            {description}
          </p>
        )}

        {price && (
          <p className="card__price">
            ${price}
          </p>
        )}

        <button
          className="card__button"
          onClick={onClick}
        >
          {buttonText}
        </button>

      </div>
    </div>
  );
}

export default Card;