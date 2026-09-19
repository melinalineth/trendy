import { useCallback, useEffect, useState } from "react";
import authService, {
  AUTH_LOGOUT_EVENT,
  AUTH_TOKEN_KEY,
} from "../services/auth.service";
import { AuthContext } from "./auth-context";

const AUTH_USUARIO_KEY = "trendy_usuario";

function leerUsuarioGuardado() {
  try {
    const raw = localStorage.getItem(AUTH_USUARIO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() =>
    localStorage.getItem(AUTH_TOKEN_KEY),
  );
  const [usuario, setUsuario] = useState(() => leerUsuarioGuardado());

  const limpiarSesion = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USUARIO_KEY);
    setToken(null);
    setUsuario(null);
  }, []);

  // Si la API responde 401 en cualquier momento (token vencido/inválido),
  // el interceptor de auth.service.js dispara este evento y acá limpiamos
  // el estado de sesión sin necesidad de validar el token contra el backend.
  useEffect(() => {
    window.addEventListener(AUTH_LOGOUT_EVENT, limpiarSesion);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, limpiarSesion);
  }, [limpiarSesion]);

  const login = useCallback(async (correo, password) => {
    const data = await authService.login({ correo, password });
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    localStorage.setItem(AUTH_USUARIO_KEY, JSON.stringify(data.usuario));
    setToken(data.token);
    setUsuario(data.usuario);
    return data;
  }, []);

  const register = useCallback(async (datos) => {
    return authService.register(datos);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      limpiarSesion();
    }
  }, [limpiarSesion]);

  const value = {
    usuario,
    token,
    isAuthenticated: Boolean(token),
    login,
    logout,
    register,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
