import React, { useState } from "react";
import "./ImageGallery.css";

function ImageGallery({ images = [] }) {
  const [selectedImage, setSelectedImage] = useState(images[0]);

  if (images.length === 0) {
    return <p className="image-gallery__empty">No hay imágenes disponibles.</p>;
  }

  return (
    <div className="image-gallery">
      <div className="image-gallery__main">
        <img
          src={selectedImage}
          alt="Producto"
        />
      </div>

      <div className="image-gallery__thumbnails">
        {images.map((image, index) => (
          <button
            key={index}
            className={`image-gallery__thumbnail ${
              selectedImage === image
                ? "image-gallery__thumbnail--active"
                : ""
            }`}
            onClick={() => setSelectedImage(image)}
          >
            <img src={image} alt={`Vista ${index + 1}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default ImageGallery;