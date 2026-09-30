import { Routes, Route } from "react-router-dom";

import Home from "../pages/public/Home";
import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";
import ForgotPassword from "../pages/auth/ForgotPassword";
import RestablecerPassword from "../pages/auth/RestablecerPassword";
import Direcciones from "../pages/customer/Direcciones";
import RoleGuard from "../components/auth/RoleGuard";
import Sellers from "../pages/admin/Sellers";
import Users from "../pages/admin/Users";
import Roles from "../pages/admin/Roles";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
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
      {/* Panel de vendedor (rutas /vendedor/*) queda pendiente: no forma
          parte del alcance de Ronda 3 (RF-007, RF-045, RF-046 son
          exclusivamente de administración). */}
    </Routes>
  );
}

export default AppRoutes;
