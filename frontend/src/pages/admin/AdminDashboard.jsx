import PanelInicio from "../../components/dashboard/PanelInicio";

// Wrapper de ruta (/admin): la implementación vive en PanelInicio (compartida
// con /vendedor). El <main> de la pantalla lo pone AdminLayout, por eso el panel
// va `envuelto` (un <div>, no otro <main>).
function AdminDashboard() {
  return <PanelInicio rol="admin" envuelto />;
}

export default AdminDashboard;
