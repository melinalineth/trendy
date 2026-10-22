import PanelInicio from "../../components/dashboard/PanelInicio";

// Wrapper de ruta (/vendedor): la implementación vive en PanelInicio
// (compartida con /admin).
function SellerDashboard() {
  return <PanelInicio rol="vendedor" />;
}

export default SellerDashboard;
