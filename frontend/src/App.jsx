import Header from "./components/layout/Header";
import { AuthProvider } from "./context/AuthContext";
import AppRoutes from "./router/AppRouter";

function App() {
  return (
    <AuthProvider>
      <div>
        <Header />
        <AppRoutes />
      </div>
    </AuthProvider>
  );
}

export default App;
