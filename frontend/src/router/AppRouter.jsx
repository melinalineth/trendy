import { Routes, Route } from "react-router-dom";

import Home from "../pages/public/Home";
import Catalog from "../pages/public/Catalog";
import ProductDetail from "../pages/public/ProductDetail";
import NotFound from "../pages/public/NotFound";
import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";
import ForgotPassword from "../pages/auth/ForgotPassword";
import RestablecerPassword from "../pages/auth/RestablecerPassword";
import Direcciones from "../pages/customer/Direcciones";
import Cart from "../pages/customer/Cart";
import RoleGuard from "../components/auth/RoleGuard";
import Sellers from "../pages/admin/Sellers";
import Users from "../pages/admin/Users";
import Roles from "../pages/admin/Roles";
import AdminProducts from "../pages/admin/Products";
import SellerProducts from "../pages/seller/Products";
import AdminInventory from "../pages/admin/Inventory";
import SellerInventory from "../pages/seller/Inventory";
import ZonasCobertura from "../pages/admin/ZonasCobertura";
import Checkout from "../pages/customer/Checkout";
import CustomerOrders from "../pages/customer/Orders";
import OrderDetail from "../pages/customer/OrderDetail";
import AdminOrders from "../pages/admin/Orders";
import SellerOrders from "../pages/seller/Orders";
import AdminSales from "../pages/admin/Sales";
import SellerSales from "../pages/seller/Sales";

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
        path="/carrito"
        element={
          <RoleGuard roles={["cliente"]}>
            <Cart />
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
      {/* RF-026: zonas de cobertura y tarifas de envío (solo admin). */}
      <Route
        path="/admin/envios"
        element={
          <RoleGuard roles={["admin"]}>
            <ZonasCobertura />
          </RoleGuard>
        }
      />
      {/* Sprint 4: checkout, pedidos y pagos (RF-028, RF-030 a RF-032,
          RF-034, RF-037, RF-038). El cliente compra y consulta SUS pedidos;
          admin y vendedor los gestionan desde el panel compartido. */}
      <Route
        path="/checkout"
        element={
          <RoleGuard roles={["cliente"]}>
            <Checkout />
          </RoleGuard>
        }
      />
      <Route
        path="/pedidos"
        element={
          <RoleGuard roles={["cliente"]}>
            <CustomerOrders />
          </RoleGuard>
        }
      />
      <Route
        path="/pedidos/:id"
        element={
          <RoleGuard roles={["cliente"]}>
            <OrderDetail />
          </RoleGuard>
        }
      />
      <Route
        path="/admin/pedidos"
        element={
          <RoleGuard roles={["admin"]}>
            <AdminOrders />
          </RoleGuard>
        }
      />
      <Route
        path="/vendedor/pedidos"
        element={
          <RoleGuard roles={["vendedor"]}>
            <SellerOrders />
          </RoleGuard>
        }
      />
      {/* Sprint 5: consulta de ventas (RF-042). En v1.0 admin y vendedor ven
          todas las ventas desde el mismo panel compartido. */}
      <Route
        path="/admin/ventas"
        element={
          <RoleGuard roles={["admin"]}>
            <AdminSales />
          </RoleGuard>
        }
      />
      <Route
        path="/vendedor/ventas"
        element={
          <RoleGuard roles={["vendedor"]}>
            <SellerSales />
          </RoleGuard>
        }
      />
      {/* Resto del panel de vendedor (rutas /vendedor/*) queda pendiente:
          RF-007, RF-045, RF-046 son exclusivamente de administración y no
          forman parte de esta ronda. Gestión de productos (RF-013, RF-014,
          RF-016) y de inventario (RF-017) sí son de vendedor/admin, por eso
          /vendedor/productos y /vendedor/inventario ya están wireadas acá. */}
      {/* Cualquier URL que no coincide con las anteriores: pantalla de
          "página no encontrada" en vez de una página en blanco. Va ÚLTIMA:
          React Router elige la ruta más específica, pero así queda claro que
          es el comodín. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRoutes;
