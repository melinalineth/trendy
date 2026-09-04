import React from "react";
import "./MenuCategorias.css";

function MenuCategorias() {
  const categorias = [
    {
      nombre: "Mujer",
      icono: "👗",
      ruta: "/mujer",
    },
    {
      nombre: "Hombre",
      icono: "👕",
      ruta: "/hombre",
    },
    {
      nombre: "Niños",
      icono: "🧸",
      ruta: "/ninos",
    },
    {
      nombre: "Accesorios",
      icono: "👜",
      ruta: "/accesorios",
    },
  ];

  return (
    <section className="categorias">
      <div className="categorias__container">

        <div className="categorias__header">
          <h2 className="categorias__title">
            Explora nuestras categorías
          </h2>

          <p className="categorias__subtitle">
            Encuentra el estilo perfecto para ti
          </p>
        </div>

        <div className="categorias__grid">
          {categorias.map((categoria) => (
            <a
              key={categoria.nombre}
              href={categoria.ruta}
              className="categoria-card"
            >
              <div className="categoria-card__icon">
                {categoria.icono}
              </div>

              <h3 className="categoria-card__title">
                {categoria.nombre}
              </h3>

              <span className="categoria-card__link">
                Ver productos →
              </span>
            </a>
          ))}
        </div>

      </div>
    </section>
  );
}

export default MenuCategorias;