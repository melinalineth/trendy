import React from "react";
import "./Sidebar.css";

function Sidebar() {
  return (
    <aside className="sidebar">
      <h2 className="sidebar__title">Categorías</h2>

      <ul className="sidebar__list">
        <li>
          <a href="/mujer">Mujer</a>
        </li>
        <li>
          <a href="/hombre">Hombre</a>
        </li>
        <li>
          <a href="/ninos">Niños</a>
        </li>
        <li>
          <a href="/accesorios">Accesorios</a>
        </li>
        <li>
          <a href="/ofertas">Ofertas</a>
        </li>
      </ul>

      <div className="sidebar__filter">
        <h3>Filtrar por precio</h3>

        <label>
          Precio mínimo
          <input type="number" placeholder="$0" />
        </label>

        <label>
          Precio máximo
          <input type="number" placeholder="$500.000" />
        </label>

        <button className="sidebar__button">
          Aplicar filtros
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
