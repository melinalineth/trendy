import SalesPanel from "../../components/sales/SalesPanel";

// Wrapper de ruta: la implementación vive en SalesPanel (compartida con
// /vendedor/ventas).
function Sales() {
  return <SalesPanel />;
}

export default Sales;
