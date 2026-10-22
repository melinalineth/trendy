import PanelInicio from "../../components/dashboard/PanelInicio";

// Wrapper de ruta (/vendedor): la implementación vive en PanelInicio
// (compartida con /admin). El <main> de la pantalla lo pone PersonalLayout.
function SellerDashboard() {
  return <PanelInicio rol="vendedor" />;
}

export default SellerDashboard;
