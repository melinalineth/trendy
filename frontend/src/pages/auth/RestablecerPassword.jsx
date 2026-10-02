import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import Input from "../../components/common/Input";
import Button from "../../components/common/Button";
import Alert from "../../components/common/Alert";
import authService from "../../services/auth.service";
import "./auth.css";

const MENSAJE_ERROR_GENERICO =
  "El enlace es inválido o ya venció. Solicitá uno nuevo desde 'Recuperar contraseña'.";
const MENSAJE_PASSWORDS_NO_COINCIDEN = "Las contraseñas no coinciden.";

function RestablecerPassword() {
  // Patrón de ruta elegido: /restablecer-password/:token (el token llega
  // como segmento de la URL, no como query param, para no exponerlo en
  // logs de query strings ni en el historial de forma tan visible).
  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (password !== confirmacion) {
      setError(MENSAJE_PASSWORDS_NO_COINCIDEN);
      return;
    }

    setCargando(true);

    try {
      await authService.restablecerPassword(token, password);
      setExito(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      const mensaje = err.response?.data?.mensaje || MENSAJE_ERROR_GENERICO;
      setError(mensaje);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Restablecer contraseña</h1>

        {error && (
          <Alert type="error" message={error} onClose={() => setError("")} />
        )}
        {exito && (
          <Alert
            type="success"
            message="Contraseña actualizada con éxito. Te llevamos al login..."
          />
        )}

        {!exito && (
          <>
            <label className="auth-form__field">
              Nueva contraseña
              <Input
                type="password"
                name="password"
                placeholder="********"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            <label className="auth-form__field">
              Confirmar contraseña
              <Input
                type="password"
                name="confirmacion"
                placeholder="********"
                value={confirmacion}
                onChange={(event) => setConfirmacion(event.target.value)}
              />
            </label>

            <Button
              type="submit"
              text={cargando ? "Guardando..." : "Guardar nueva contraseña"}
              disabled={cargando}
            />
          </>
        )}

        <div className="auth-form__links">
          <Link to="/login">Volver al login</Link>
        </div>
      </form>
    </div>
  );
}

export default RestablecerPassword;
