import { Link } from "react-router-dom";
import SearchBar from "../products/SearchBar";
import UserMenu from "./UserMenu";
import { useAuth } from "../../hooks/useAuth";
import { useCarritoContador } from "../../hooks/useCarritoContador";
import { rutaInicioDeRol } from "./menuUsuario";
import "./Header.css";

const Header = ({ title = "Trendy", subtitle }) => {
  const { usuario, isAuthenticated } = useAuth();
  const cantidadCarrito = useCarritoContador();

  // Solo el cliente (o quien todavía no inició sesión, que al entrar al
  // carrito pasa por el login) tiene carrito: vendedor y admin no lo ven.
  const rol = usuario?.rol?.nombre;
  const mostrarCarrito = !isAuthenticated || rol === "cliente";

  // El título es un enlace al inicio: el personal vuelve a su panel (desde la
  // tienda no tiene otro enlace, porque su menú de usuario solo cierra
  // sesión) y el cliente y el visitante, a la portada.
  const rutaInicio = isAuthenticated ? rutaInicioDeRol(rol) : "/";
  const vaAlPanel = rutaInicio !== "/";

  // En la barra quedan solo el buscador, el menú de usuario y el carrito. Los
  // accesos del cliente ("Mis pedidos", etc.) viven dentro del menú (UserMenu
  // / menuUsuario.js) para no repetirlos acá; el personal navega con el menú
  // lateral (PersonalLayout) y su menú de usuario solo cierra sesión.
  return (
    <header className="app-header">
      <div className="header-content">
        <h1 className="header-title">
          <Link
            to={rutaInicio}
            className="header-title__enlace"
            aria-label={`${title}: ${vaAlPanel ? "ir a tu panel" : "ir al inicio"}`}
          >
            {title}
          </Link>
        </h1>
        {subtitle && <p className="header-subtitle">{subtitle}</p>}
        <div className="header__actions">
          <SearchBar />

          <UserMenu />

          {mostrarCarrito && (
            <Link
              to="/carrito"
              className="header__cart"
              aria-label={
                cantidadCarrito > 0
                  ? `Carrito, ${cantidadCarrito} producto(s)`
                  : "Carrito"
              }
            >
              🛒
              <span className="header__cart-count">{cantidadCarrito}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
