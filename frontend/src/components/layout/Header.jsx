import React from "react";
import "./Header.css";

const Header = ({ title = "Mi aplicación", subtitle }) => {
  return (
    <header className="app-header">
      <div className="header-content">
        <h1 className="header-title">{title}</h1>
        {subtitle && <p className="header-subtitle">{subtitle}</p>}
        <div className="header__actions">
  <SearchBar />

  <button className="header__icon">
    👤
  </button>

  <a href="/carrito" className="header__cart">
    🛒
    <span className="header__cart-count">0</span>
  </a>
</div>
      </div>
    </header>
  );
};

export default Header;
