import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import {
  ENTRADAS_POR_ROL,
  ENTRADAS_VISITANTE,
  ETIQUETA_ROL,
} from "./menuUsuario";
import "./UserMenu.css";

// Menú de usuario del Header (RF-002). Botón con aria-haspopup/aria-expanded
// que abre un panel con:
//  - visitante: Iniciar sesión / Crear cuenta;
//  - con sesión: nombre y rol, las entradas del rol (menuUsuario.js) y
//    "Cerrar sesión".
// Se cierra con Escape (devolviendo el foco al botón), con un clic afuera,
// al salir con Tab del panel y al cambiar de ruta.
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
  const panelRef = useRef(null);

  const rol = usuario?.rol?.nombre;
  const entradas = isAuthenticated
    ? (ENTRADAS_POR_ROL[rol] ?? [])
    : ENTRADAS_VISITANTE;

  function cerrar({ devolverFoco = false } = {}) {
    setAbiertoEn(null);
    if (devolverFoco) botonRef.current?.focus();
  }

  // Al abrir, el foco pasa a la primera opción del panel.
  useEffect(() => {
    if (!abierto) return;
    panelRef.current?.querySelector('[role="menuitem"]')?.focus();
  }, [abierto]);

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

  // Si el foco pasa a otro elemento de la página (Tab hacia afuera) se cierra
  // sin robarlo. Con relatedTarget nulo NO cerramos: Safari no enfoca los
  // botones al hacer clic y cerraría el panel antes de que llegue el clic;
  // el clic afuera ya lo resuelve el listener de pointerdown.
  function alPerderFoco(event) {
    const destino = event.relatedTarget;
    if (destino && !contenedorRef.current?.contains(destino)) {
      setAbiertoEn(null);
    }
  }

  // Flechas, Inicio y Fin recorren las opciones del panel.
  function alTeclearEnPanel(event) {
    const teclas = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!teclas.includes(event.key)) return;

    const items = [...panelRef.current.querySelectorAll('[role="menuitem"]')];
    if (items.length === 0) return;

    event.preventDefault();
    const actual = items.indexOf(document.activeElement);
    let destino;

    if (event.key === "Home") destino = 0;
    else if (event.key === "End") destino = items.length - 1;
    else if (event.key === "ArrowDown") destino = (actual + 1) % items.length;
    else destino = (actual - 1 + items.length) % items.length;

    items[destino].focus();
  }

  // Cierre de sesión: la llamada al backend es "mejor esfuerzo" (el contexto
  // limpia la sesión local igual si falla) y siempre terminamos en /login.
  async function cerrarSesion() {
    setAbiertoEn(null);
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  }

  return (
    <div className="user-menu" ref={contenedorRef} onBlur={alPerderFoco}>
      <button
        type="button"
        ref={botonRef}
        className="user-menu__button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? panelId : undefined}
        aria-label={
          isAuthenticated
            ? `Menú de usuario de ${usuario?.nombre ?? "tu cuenta"}`
            : "Menú de usuario"
        }
        onClick={() => setAbiertoEn(abierto ? null : location.key)}
      >
        <span aria-hidden="true">👤</span>
      </button>

      {abierto && (
        <div className="user-menu__panel" id={panelId} ref={panelRef}>
          {isAuthenticated && (
            <div className="user-menu__identity">
              <span className="user-menu__name">{usuario?.nombre}</span>
              <span className="user-menu__role">
                {ETIQUETA_ROL[rol] ?? rol}
              </span>
            </div>
          )}

          <ul
            className="user-menu__list"
            role="menu"
            aria-label="Menú de usuario"
            onKeyDown={alTeclearEnPanel}
          >
            {entradas.map((entrada) => (
              <li key={entrada.ruta} role="none">
                <Link
                  to={entrada.ruta}
                  role="menuitem"
                  className="user-menu__item"
                  onClick={() => cerrar()}
                >
                  {entrada.etiqueta}
                </Link>
              </li>
            ))}

            {isAuthenticated && (
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="user-menu__item user-menu__item--logout"
                  onClick={cerrarSesion}
                >
                  Cerrar sesión
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default UserMenu;
