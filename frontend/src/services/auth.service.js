import api, { AUTH_LOGOUT_EVENT, AUTH_TOKEN_KEY } from "./apiClient";

export { AUTH_TOKEN_KEY, AUTH_LOGOUT_EVENT };

function register(datos) {
  return api.post("/auth/register", datos).then((response) => response.data);
}

function login(datos) {
  return api.post("/auth/login", datos).then((response) => response.data);
}

// Con timeout para que un backend colgado no deje al usuario esperando para
// salir: el cierre de sesión local no depende de esta respuesta.
function logout() {
  return api
    .post("/auth/logout", null, { timeout: 5000 })
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
