import SalesPanel from "../../components/sales/SalesPanel";

// Wrapper de ruta: la implementación vive en SalesPanel (compartida con
// /admin/ventas). En v1.0 el vendedor ve todas las ventas, igual que el admin.
function Sales() {
  return <SalesPanel />;
}

export default Sales;
