import { Link } from "react-router-dom";
import SearchBar from "../products/SearchBar";
import UserMenu from "./UserMenu";
import { useAuth } from "../../hooks/useAuth";
import { useCarritoContador } from "../../hooks/useCarritoContador";
import "./Header.css";

const Header = ({ title = "Trendy", subtitle }) => {
  const { usuario, isAuthenticated } = useAuth();
  const cantidadCarrito = useCarritoContador();

  // Solo el cliente (o quien todavía no inició sesión, que al entrar al
  // carrito pasa por el login) tiene carrito: vendedor y admin no lo ven.
  const rol = usuario?.rol?.nombre;
  const mostrarCarrito = !isAuthenticated || rol === "cliente";

  // En la barra quedan solo el buscador, el menú de usuario y el carrito. Los
  // accesos del cliente ("Mis pedidos", etc.) viven dentro del menú (UserMenu
  // / menuUsuario.js) para no repetirlos acá; el personal navega con el menú
  // lateral (PersonalLayout) y su menú de usuario solo cierra sesión.
  return (
    <header className="app-header">
      <div className="header-content">
        <h1 className="header-title">{title}</h1>
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
