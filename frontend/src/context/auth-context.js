import { createContext } from "react";

// Objeto de contexto separado del componente AuthProvider (AuthContext.jsx)
// porque la regla react-refresh/only-export-components de este proyecto no
// permite que un mismo archivo exporte un componente y un valor que no lo es.
export const AuthContext = createContext(null);
