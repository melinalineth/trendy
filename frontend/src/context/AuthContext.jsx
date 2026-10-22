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

  // Otra pestaña inició o cerró sesión: localStorage cambia y el evento
  // "storage" solo llega a las demás pestañas, así que acá releemos el estado
  // para no dejar la interfaz con un usuario que ya no tiene sesión (o al
  // revés). Cubre también un localStorage.clear() (event.key === null).
  useEffect(() => {
    function alCambiarStorage(event) {
      const claves = [AUTH_TOKEN_KEY, AUTH_USUARIO_KEY];
      if (event.key !== null && !claves.includes(event.key)) return;

      setToken(localStorage.getItem(AUTH_TOKEN_KEY));
      setUsuario(leerUsuarioGuardado());
    }

    window.addEventListener("storage", alCambiarStorage);
    return () => window.removeEventListener("storage", alCambiarStorage);
  }, []);

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

  // Cierre de sesión: "limpiar primero, avisar después". El backend usa JWT
  // sin estado y su /auth/logout solo responde 200 (no invalida el token), así
  // que la sesión local se borra AL INSTANTE, sin esperar al servidor (si
  // estuviera caído o colgado, la sesión seguiría viva en esta y en otras
  // pestañas). Después se avisa al backend en segundo plano con el token
  // capturado antes de borrarlo (el interceptor ya no lo encontraría) y se
  // ignora cualquier error. Es idempotente: sin token no hace nada, así que
  // un segundo clic no dispara otro POST.
  const logout = useCallback(() => {
    const tokenActual = localStorage.getItem(AUTH_TOKEN_KEY);

    limpiarSesion();

    if (tokenActual) {
      authService.logout(tokenActual).catch(() => {
        // Mejor esfuerzo: el usuario ya salió, no hay nada que mostrar.
      });
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
