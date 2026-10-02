import InventarioPanel from "../../components/inventory/InventarioPanel";

// Wrapper de ruta: la implementación real vive en InventarioPanel (compartida
// con /vendedor/inventario) — mismo patrón que Products.jsx (ver
// ProductsPanel.jsx) y Sellers/Users/Roles.
//
// Nota de reemplazo (Ronda 4, RF-017): este archivo antes traía ~450 líneas
// de UI con datos hardcodeados (rescatada de una rama de Sprint 0, ver
// feature/Inventory en el historial de git) que además dibujaba su propio
// sidebar/topbar completo (links a /admin/dashboard, /admin/customers,
// /admin/reports, /admin/shipping, /admin/settings, etc.). Se reemplazó en
// vez de conectarla al backend real por dos motivos:
//   1. Esas rutas del sidebar no existen en AppRouter.jsx (las reales son
//      /admin/productos, /admin/vendedores, etc., en español) y no hay
//      ningún otro panel de admin/vendedor en el proyecto que dibuje su
//      propia navegación — Sellers/Users/Roles/Products son todos contenido
//      "pelado" que asume que el layout de la app se resuelve en otro lado.
//      Reconectar esa UI hubiera introducido la única pantalla con chrome
//      propio y roto la consistencia del resto del panel.
//   2. Los datos que mostraba (minStock, imagen del producto, "Bodega
//      principal", fecha fija "12/06/2026") no existen en el contrato real
//      de GET /api/v1/inventario, así que gran parte de esa UI no se podía
//      conectar tal cual sin inventar campos que el backend no manda.
// Se conservó el criterio útil de esa pantalla (buscador, resaltar stock
// bajo, modal de detalle/ajuste) reimplementado en InventarioPanel.jsx sobre
// los componentes comunes (Table/Modal/Button) que ya usa el resto del
// proyecto.
function Inventory() {
  return <InventarioPanel />;
}

export default Inventory;
