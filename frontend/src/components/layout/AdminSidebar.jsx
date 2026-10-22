import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import IconoMenu from "./IconoMenu";
import "./AdminSidebar.css";

// Menú lateral de las pantallas del personal (hoy lo usa el admin vía
// AdminLayout; recibe las entradas por props para que el vendedor pueda
// reutilizarlo). Cada entrada es `{ etiqueta, ruta, icono? }` (ver
// menuUsuario.js, que es la única fuente de la lista).
//
// - Escritorio (>= 900 px): columna fija a la izquierda, siempre visible, que
//   acompaña el scroll (sticky).
// - Celular/tablet (< 900 px): no ocupa la pantalla. Es el patrón "disclosure"
//   (igual que UserMenu): un botón con aria-expanded/aria-controls muestra u
//   oculta la misma lista, apilada a todo el ancho. Se cierra con Escape
//   (devolviendo el foco al botón), al elegir una entrada y al cambiar de ruta.
//   En escritorio el botón no se ve y la lista siempre está visible (lo decide
//   el CSS, no el estado).
function AdminSidebar({
  entradas,
  titulo = "Administración",
  nombre = "",
  etiquetaMenu = "Menú de administración",
  rutaTienda = "/catalogo",
}) {
  const location = useLocation();
  const panelId = useId();

  // Guardamos EN QUÉ ubicación se abrió en vez de un booleano: al navegar
  // cambia `location.key` y queda cerrado solo, sin un useEffect con setState
  // (mismo criterio que UserMenu).
  const [abiertoEn, setAbiertoEn] = useState(null);
  const abierto = abiertoEn === location.key;

  const botonRef = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;

    function alTeclear(event) {
      if (event.key === "Escape") {
        setAbiertoEn(null);
        botonRef.current?.focus();
      }
    }

    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  // Al elegir una entrada con el menú abierto (solo pasa en celular) la lista
  // se oculta: devolvemos el foco al botón para no dejarlo en un enlace que
  // desaparece. En escritorio `abierto` es siempre falso y no se toca el foco.
  function alElegirEntrada() {
    if (abierto) {
      setAbiertoEn(null);
      botonRef.current?.focus();
    }
  }

  return (
    <div className={`admin-sidebar${abierto ? " admin-sidebar--abierto" : ""}`}>
      <button
        type="button"
        ref={botonRef}
        className="admin-sidebar__toggle"
        aria-expanded={abierto}
        aria-controls={panelId}
        onClick={() => setAbiertoEn(abierto ? null : location.key)}
      >
        <IconoMenu nombre="menu" />
        <span className="admin-sidebar__toggle-texto">{etiquetaMenu}</span>
        <IconoMenu nombre="flecha" className="admin-sidebar__toggle-flecha" />
      </button>

      <div className="admin-sidebar__interior" id={panelId}>
        <div className="admin-sidebar__identidad">
          <p className="admin-sidebar__titulo">{titulo}</p>
          {nombre && <p className="admin-sidebar__nombre">{nombre}</p>}
        </div>

        <nav aria-label={etiquetaMenu}>
          <ul className="admin-sidebar__lista">
            {entradas.map((entrada) => (
              <li key={entrada.ruta}>
                {/* `end` en TODAS: "/admin" no debe quedar activa en
                    "/admin/productos"; el resto no tiene subrutas. */}
                <NavLink
                  to={entrada.ruta}
                  end
                  className="admin-sidebar__enlace"
                  onClick={alElegirEntrada}
                >
                  <IconoMenu nombre={entrada.icono} />
                  <span>{entrada.etiqueta}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <Link
          to={rutaTienda}
          className="admin-sidebar__enlace admin-sidebar__tienda"
        >
          <IconoMenu nombre="tienda" />
          <span>Ver la tienda</span>
        </Link>
      </div>
    </div>
  );
}

export default AdminSidebar;
