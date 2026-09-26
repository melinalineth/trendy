import { Routes, Route } from "react-router-dom";

import Home from "../pages/public/Home";
import Catalog from "../pages/public/Catalog";
import ProductDetail from "../pages/public/ProductDetail";
import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";
import ForgotPassword from "../pages/auth/ForgotPassword";
import RestablecerPassword from "../pages/auth/RestablecerPassword";
import Direcciones from "../pages/customer/Direcciones";
import RoleGuard from "../components/auth/RoleGuard";
import Sellers from "../pages/admin/Sellers";
import Users from "../pages/admin/Users";
import Roles from "../pages/admin/Roles";
import AdminProducts from "../pages/admin/Products";
import SellerProducts from "../pages/seller/Products";
import AdminInventory from "../pages/admin/Inventory";
import SellerInventory from "../pages/seller/Inventory";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/catalogo" element={<Catalog />} />
      <Route path="/productos/:id" element={<ProductDetail />} />
      <Route path="/login" element={<Login />} />
      <Route path="/registro" element={<Register />} />
      <Route path="/recuperar-password" element={<ForgotPassword />} />
      <Route
        path="/restablecer-password/:token"
        element={<RestablecerPassword />}
      />
      <Route
        path="/direcciones"
        element={
          <RoleGuard roles={["cliente"]}>
            <Direcciones />
          </RoleGuard>
        }
      />
      <Route
        path="/admin/vendedores"
        element={
          <RoleGuard roles={["admin"]}>
            <Sellers />
          </RoleGuard>
        }
      />
      <Route
        path="/admin/usuarios"
        element={
          <RoleGuard roles={["admin"]}>
            <Users />
          </RoleGuard>
        }
      />
      <Route
        path="/admin/roles"
        element={
          <RoleGuard roles={["admin"]}>
            <Roles />
          </RoleGuard>
        }
      />
      <Route
        path="/admin/productos"
        element={
          <RoleGuard roles={["admin"]}>
            <AdminProducts />
          </RoleGuard>
        }
      />
      <Route
        path="/vendedor/productos"
        element={
          <RoleGuard roles={["vendedor"]}>
            <SellerProducts />
          </RoleGuard>
        }
      />
      <Route
        path="/admin/inventario"
        element={
          <RoleGuard roles={["admin"]}>
            <AdminInventory />
          </RoleGuard>
        }
      />
      <Route
        path="/vendedor/inventario"
        element={
          <RoleGuard roles={["vendedor"]}>
            <SellerInventory />
          </RoleGuard>
        }
      />
      {/* Resto del panel de vendedor (rutas /vendedor/*) queda pendiente:
          RF-007, RF-045, RF-046 son exclusivamente de administración y no
          forman parte de esta ronda. Gestión de productos (RF-013, RF-014,
          RF-016) y de inventario (RF-017) sí son de vendedor/admin, por eso
          /vendedor/productos y /vendedor/inventario ya están wireadas acá. */}
    </Routes>
  );
}

export default AppRoutes;
