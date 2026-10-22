import Header from "./components/layout/Header";
import { AuthProvider } from "./context/AuthContext";
import AppRoutes from "./router/AppRouter";
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <div className="app-shell">
        <Header />
        <div className="app-shell__contenido">
          <AppRoutes />
        </div>
      </div>
    </AuthProvider>
  );
}

export default App;
