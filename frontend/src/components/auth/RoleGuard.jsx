import { Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

// Protege rutas por rol. `usuario.rol` es el objeto Rol que devuelve el
// backend (incluye la relación completa vía Prisma `include: { rol: true }`
// en auth.service.js del backend), por eso comparamos contra
// `usuario.rol.nombre` (string, ej. "cliente", "admin") y no contra
// `usuario.rol` ni contra `usuario.rolId` (el FK numérico).
function RoleGuard({ roles = [], children }) {
  const { usuario, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const rolUsuario = usuario?.rol?.nombre;
  const tienePermiso = roles.length === 0 || roles.includes(rolUsuario);

  if (!tienePermiso) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default RoleGuard;
