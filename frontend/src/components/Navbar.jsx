import React from "react";
import "./Navbar.css";

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar__container">

        {/* Menú principal */}
        <ul className="navbar__menu">

          <li className="navbar__item">
            <a href="/" className="navbar__link">
              Inicio
            </a>
          </li>

          <li className="navbar__item">
            <a href="/mujer" className="navbar__link">
              Mujer
            </a>
          </li>

          <li className="navbar__item">
            <a href="/hombre" className="navbar__link">
              Hombre
            </a>
          </li>

          <li className="navbar__item">
            <a href="/ninos" className="navbar__link">
              Niños
            </a>
          </li>

          <li className="navbar__item">
            <a href="/accesorios" className="navbar__link">
              Accesorios
            </a>
          </li>

          <li className="navbar__item">
            <a href="/ofertas" className="navbar__link navbar__link--offer">
              Ofertas
            </a>
          </li>

        </ul>

      </div>
    </nav>
  );
}

export default Navbar;