import PanelInicio from "../../components/dashboard/PanelInicio";

// Wrapper de ruta (/admin): la implementación vive en PanelInicio (compartida
// con /vendedor).
function AdminDashboard() {
  return <PanelInicio rol="admin" />;
}

export default AdminDashboard;
