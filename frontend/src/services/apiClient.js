import axios from "axios";

export const AUTH_TOKEN_KEY = "trendy_token";
export const AUTH_LOGOUT_EVENT = "trendy:auth-logout";

const baseURL = import.meta.env.VITE_API_URL || "/api/v1";

// Instancia axios compartida por todos los servicios (auth, direcciones,
// etc.) para no duplicar la configuración de baseURL ni los interceptores
// de token / logout automático en cada archivo de servicio.
const api = axios.create({ baseURL });

// Agrega el token guardado (si existe) a cada request saliente.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Ante cualquier 401 (token vencido, revocado o inválido) limpiamos la
// sesión local y avisamos al resto de la app vía un evento del navegador,
// para no crear un import circular entre los servicios y el AuthContext.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
    }

    return Promise.reject(error);
  },
);

export default api;
