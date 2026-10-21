import { Link } from "react-router-dom";

import "./NotFound.css";

// Pantalla para cualquier URL que no coincide con ninguna ruta de la app (la
// ruta `path="*"` de AppRouter). Antes esas URLs dejaban la página en blanco
// debajo del Header. Es pública a propósito: no consulta la sesión ni la API,
// así sirve igual para visitantes, clientes, vendedores y admins.
function NotFound() {
  return (
    <main className="no-encontrado">
      <section className="no-encontrado__tarjeta">
        <p className="no-encontrado__codigo" aria-hidden="true">
          404
        </p>
        <h1 className="no-encontrado__titulo">No encontramos esta página</h1>
        <p className="no-encontrado__texto">
          La dirección que abriste no existe o ya no está disponible. Revisá que
          esté bien escrita o volvé a una de estas secciones.
        </p>
        <div className="no-encontrado__acciones">
          <Link to="/" className="no-encontrado__link no-encontrado__link--primario">
            Ir al inicio
          </Link>
          <Link to="/catalogo" className="no-encontrado__link no-encontrado__link--secundario">
            Ver el catálogo
          </Link>
        </div>
      </section>
    </main>
  );
}

export default NotFound;
