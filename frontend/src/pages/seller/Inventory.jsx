import InventarioPanel from "../../components/inventory/InventarioPanel";

// Wrapper de ruta: la implementación real vive en InventarioPanel (compartida
// con /admin/inventario). El contrato de API no filtra el inventario por
// vendedor todavía (no existe un GET /inventario?vendedorId=...), así que
// este panel muestra el mismo listado completo que ve admin — misma
// limitación conocida que ya documenta ProductsPanel.jsx para productos.
function Inventory() {
  return <InventarioPanel />;
}

export default Inventory;
