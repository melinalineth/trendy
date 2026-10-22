import api, { AUTH_LOGOUT_EVENT, AUTH_TOKEN_KEY } from "./apiClient";

export { AUTH_TOKEN_KEY, AUTH_LOGOUT_EVENT };

function register(datos) {
  return api.post("/auth/register", datos).then((response) => response.data);
}

function login(datos) {
  return api.post("/auth/login", datos).then((response) => response.data);
}

// Aviso de cierre de sesión al backend. Se llama DESPUÉS de borrar la sesión
// local, así que recibe el token y lo manda en el header (el interceptor ya no
// lo encuentra en localStorage). `omitirCierreAutomatico` evita que un 401
// tardío de esta llamada dispare el cierre global y borre una sesión nueva si
// el usuario ya volvió a iniciar sesión. El timeout es solo un tope para no
// dejar un request colgado: ya no condiciona la interfaz.
function logout(token) {
  return api
    .post("/auth/logout", null, {
      timeout: 5000,
      headers: { Authorization: `Bearer ${token}` },
      omitirCierreAutomatico: true,
    })
    .then((response) => response.data);
}

function recuperarPassword(correo) {
  return api
    .post("/auth/recuperar-password", { correo })
    .then((response) => response.data);
}

function restablecerPassword(token, password) {
  return api
    .post("/auth/restablecer-password", { token, password })
    .then((response) => response.data);
}

const authService = {
  register,
  login,
  logout,
  recuperarPassword,
  restablecerPassword,
};

export default authService;
