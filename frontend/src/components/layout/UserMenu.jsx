import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import {
  ENTRADAS_POR_ROL,
  ENTRADAS_VISITANTE,
  ETIQUETA_ROL,
  entradasMenuUsuario,
} from "./menuUsuario";
import "./UserMenu.css";

// Menú de usuario del Header (RF-002), con el patrón "disclosure" de WAI-ARIA
// para menús de navegación: un botón con aria-expanded/aria-controls que
// muestra u oculta un panel con una lista normal de enlaces (no es un
// role="menu", que obligaría a lectores de pantalla a modo aplicación y a
// manejar el foco con flechas). El foco se queda en el botón y Tab entra al
// panel. El panel muestra:
//  - visitante: Iniciar sesión / Crear cuenta;
//  - con sesión: nombre y rol, las entradas del rol (menuUsuario.js) y
//    "Cerrar sesión". Admin y vendedor tienen menú lateral y navegan desde ahí:
//    su menú queda solo con la identidad y "Cerrar sesión".
// Se cierra con Escape (devolviendo el foco al botón), con un clic afuera,
// al salir con Tab del botón o del panel y al cambiar de ruta.
function UserMenu() {
  const { usuario, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const panelId = useId();

  // Guardamos EN QUÉ ubicación se abrió el menú en vez de un booleano: al
  // navegar cambia `location.key` y el menú queda cerrado solo, sin un
  // useEffect que haga setState.
  const [abiertoEn, setAbiertoEn] = useState(null);
  const abierto = abiertoEn === location.key;

  const contenedorRef = useRef(null);
  const botonRef = useRef(null);

  // `usuario` viene de localStorage: puede estar corrupto o tener un rol que
  // este frontend no conoce. Object.hasOwn evita que un rol como
  // "constructor" devuelva una propiedad heredada del objeto.
  const nombre =
    typeof usuario?.nombre === "string" ? usuario.nombre.trim() : "";
  const rol = usuario?.rol?.nombre;
  const rolConocido =
    typeof rol === "string" && Object.hasOwn(ENTRADAS_POR_ROL, rol);
  const mostrarIdentidad = isAuthenticated && nombre !== "" && rolConocido;

  let entradas = ENTRADAS_VISITANTE;
  if (isAuthenticated) {
    entradas = entradasMenuUsuario(rol);
  }

  // Mientras está abierto: clic/toque afuera y Escape cierran el menú.
  useEffect(() => {
    if (!abierto) return undefined;

    function alPresionar(event) {
      if (!contenedorRef.current?.contains(event.target)) {
        setAbiertoEn(null);
      }
    }

    function alTeclear(event) {
      if (event.key === "Escape") {
        setAbiertoEn(null);
        botonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", alPresionar);
    document.addEventListener("keydown", alTeclear);

    return () => {
      document.removeEventListener("pointerdown", alPresionar);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  // Si el foco pasa a otro elemento de la página (Tab hacia afuera, ya sea
  // desde el botón o desde el panel) se cierra sin robarlo. Con relatedTarget
  // nulo NO cerramos: Safari no enfoca los botones al hacer clic y cerraría
  // el panel antes de que llegue el clic; el clic afuera ya lo resuelve el
  // listener de pointerdown.
  function alPerderFoco(event) {
    const destino = event.relatedTarget;
    if (destino && !contenedorRef.current?.contains(destino)) {
      setAbiertoEn(null);
    }
  }

  // Cierre de sesión: la sesión local se borra al instante (el contexto
  // avisa al backend en segundo plano) y siempre terminamos en /login.
  function cerrarSesion() {
    setAbiertoEn(null);
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="user-menu" ref={contenedorRef} onBlur={alPerderFoco}>
      <button
        type="button"
        ref={botonRef}
        className="user-menu__button"
        aria-expanded={abierto}
        aria-controls={abierto ? panelId : undefined}
        aria-label={
          isAuthenticated && nombre
            ? `Menú de usuario de ${nombre}`
            : "Menú de usuario"
        }
        onClick={() => setAbiertoEn(abierto ? null : location.key)}
      >
        <span aria-hidden="true">👤</span>
      </button>

      {abierto && (
        <div className="user-menu__panel" id={panelId}>
          {mostrarIdentidad && (
            <div className="user-menu__identity">
              <span className="user-menu__name">{nombre}</span>
              <span className="user-menu__role">{ETIQUETA_ROL[rol]}</span>
            </div>
          )}

          <nav aria-label="Menú de usuario">
            <ul className="user-menu__list">
              {entradas.map((entrada) => (
                <li key={entrada.ruta}>
                  <Link
                    to={entrada.ruta}
                    className="user-menu__item"
                    onClick={() => setAbiertoEn(null)}
                  >
                    {entrada.etiqueta}
                  </Link>
                </li>
              ))}

              {isAuthenticated && (
                <li>
                  <button
                    type="button"
                    className="user-menu__item user-menu__item--logout"
                    onClick={cerrarSesion}
                  >
                    Cerrar sesión
                  </button>
                </li>
              )}
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}

export default UserMenu;
