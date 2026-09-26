import React, { useState } from "react";
import "./SearchBar.css";

// Sprint 2 (RF-008): antes este componente solo hacía console.log del
// término buscado y no avisaba a nadie más. Catalog.jsx necesita enterarse
// cuando el usuario busca para combinarlo con el resto de los filtros
// (categoría, talla, precio), así que se agrega la prop `onSearch` opcional.
// Queda opcional (con default no-op) para no romper a otros lugares que ya
// renderizaban <SearchBar /> sin pasarle nada.
function SearchBar({ onSearch = () => {} }) {
  const [search, setSearch] = useState("");

  const handleSearch = (e) => {
    e.preventDefault();

    onSearch(search.trim());
  };

  return (
    <form className="searchbar" onSubmit={handleSearch}>
      <input
        type="text"
        className="searchbar__input"
        placeholder="Buscar productos..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <button
        type="submit"
        className="searchbar__button"
        aria-label="Buscar"
      >
        🔍
      </button>
    </form>
  );
}

export default SearchBar;