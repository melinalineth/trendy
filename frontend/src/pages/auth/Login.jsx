import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Input from "../../components/common/Input";
import Button from "../../components/common/Button";
import Alert from "../../components/common/Alert";
import { useAuth } from "../../hooks/useAuth";
import "./auth.css";

const MENSAJE_ERROR_GENERICO = "Correo o contraseña incorrectos.";

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setCargando(true);

    try {
      await login(correo, password);
      navigate("/");
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
        <h1>Iniciar sesión</h1>

        {error && (
          <Alert type="error" message={error} onClose={() => setError("")} />
        )}

        <label className="auth-form__field">
          Correo electrónico
          <Input
            type="email"
            name="correo"
            placeholder="tu@correo.com"
            value={correo}
            onChange={(event) => setCorreo(event.target.value)}
          />
        </label>

        <label className="auth-form__field">
          Contraseña
          <Input
            type="password"
            name="password"
            placeholder="********"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <Button
          type="submit"
          text={cargando ? "Ingresando..." : "Ingresar"}
          disabled={cargando}
        />

        <div className="auth-form__links">
          <Link to="/recuperar-password">¿Olvidaste tu contraseña?</Link>
          <Link to="/registro">Crear una cuenta</Link>
        </div>
      </form>
    </div>
  );
}

export default Login;
