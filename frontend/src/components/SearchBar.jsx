import React, { useState } from "react";
import "./SearchBar.css";

function SearchBar() {
  const [search, setSearch] = useState("");

  const handleSearch = (e) => {
    e.preventDefault();

    if (search.trim() !== "") {
      console.log("Buscando:", search);
    }
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