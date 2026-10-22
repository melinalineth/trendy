import { Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import AdminSidebar from "./AdminSidebar";
import { entradasDePanel } from "./menuUsuario";
import "./AdminLayout.css";

// Estructura de las pantallas del administrador: menú lateral a la izquierda y,
// a la derecha, la pantalla que corresponda (<Outlet />). Se usa como "layout
// route" en AppRouter (envuelta en RoleGuard) y va DEBAJO del Header global de
// App.jsx.
//
// El área de contenido es el único <main> de la pantalla: las páginas no
// declaran el suyo (PanelInicio recibe `envuelto` para no anidarlo). Las
// páginas conservan su propio max-width/padding; este contenedor solo les da
// el ancho que queda a la derecha del menú.
//
// Una URL /admin/xyz que no existe NO coincide con ninguna ruta hija, así que
// cae en el comodín `*` del router y muestra NotFound fuera de este layout
// (sin menú lateral).
function AdminLayout() {
  const { usuario } = useAuth();
  const nombre =
    typeof usuario?.nombre === "string" ? usuario.nombre.trim() : "";

  return (
    <div className="admin-layout">
      <AdminSidebar entradas={entradasDePanel("admin")} nombre={nombre} />
      <main className="admin-layout__contenido">
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
