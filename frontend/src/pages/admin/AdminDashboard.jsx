import PanelInicio from "../../components/dashboard/PanelInicio";

// Wrapper de ruta (/admin): la implementación vive en PanelInicio (compartida
// con /vendedor). El <main> de la pantalla lo pone PersonalLayout.
function AdminDashboard() {
  return <PanelInicio rol="admin" />;
}

export default AdminDashboard;
