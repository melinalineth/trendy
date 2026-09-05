import React from "react";
import "./ProductCard.css";

function ProductCard({
  image,
  name,
  category,
  price,
  oldPrice,
  discount,
  onView,
  onAddToCart,
}) {
  return (
    <article className="product-card">

      {/* Imagen del producto */}
      <div className="product-card__image-container">
        <img
          src={image}
          alt={name}
          className="product-card__image"
        />

        {discount && (
          <span className="product-card__discount">
            -{discount}%
          </span>
        )}

        <button
          className="product-card__favorite"
          aria-label="Agregar a favoritos"
        >
          ♡
        </button>
      </div>

      {/* Información */}
      <div className="product-card__content">

        <span className="product-card__category">
          {category}
        </span>

        <h3 className="product-card__name">
          {name}
        </h3>

        {/* Precio */}
        <div className="product-card__prices">
          <span className="product-card__price">
            ${price}
          </span>

          {oldPrice && (
            <span className="product-card__old-price">
              ${oldPrice}
            </span>
          )}
        </div>

        {/* Botones */}
        <div className="product-card__actions">
          <button
            className="product-card__button product-card__button--view"
            onClick={onView}
          >
            Ver producto
          </button>

          <button
            className="product-card__button product-card__button--cart"
            onClick={onAddToCart}
            aria-label="Agregar al carrito"
          >
            🛒
          </button>
        </div>

      </div>
    </article>
  );
}

export default ProductCard;