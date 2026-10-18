import { Link } from "react-router-dom";
import SearchBar from "../products/SearchBar";
import { useAuth } from "../../hooks/useAuth";
import { useCarritoContador } from "../../hooks/useCarritoContador";
import "./Header.css";

const Header = ({ title = "Mi aplicación", subtitle }) => {
  const { usuario, isAuthenticated } = useAuth();
  const cantidadCarrito = useCarritoContador();

  // Solo el cliente (o quien todavía no inició sesión, que al entrar al
  // carrito pasa por el login) tiene carrito: vendedor y admin no lo ven.
  const rol = usuario?.rol?.nombre;
  const mostrarCarrito = !isAuthenticated || rol === "cliente";

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

  {/* Mis pedidos (RF-031): solo el cliente con sesión. */}
  {isAuthenticated && rol === "cliente" && (
    <Link to="/pedidos" className="header__link">
      Mis pedidos
    </Link>
  )}

  {/* Ventas (RF-042): solo admin y vendedor, cada uno en su ruta. */}
  {isAuthenticated && (rol === "admin" || rol === "vendedor") && (
    <Link
      to={rol === "admin" ? "/admin/ventas" : "/vendedor/ventas"}
      className="header__link"
    >
      Ventas
    </Link>
  )}

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
