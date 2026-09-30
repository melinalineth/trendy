import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Input from "../../components/common/Input";
import Button from "../../components/common/Button";
import Alert from "../../components/Alert";
import { useAuth } from "../../hooks/useAuth";
import "./auth.css";

const MENSAJE_ERROR_GENERICO =
  "No pudimos completar el registro. Revisá los datos e intentá de nuevo.";
const MENSAJE_CORREO_DUPLICADO = "Ese correo ya está registrado.";
const MENSAJE_POLITICAS_REQUERIDAS =
  "Debés aceptar las políticas para poder registrarte.";

function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [aceptaPoliticas, setAceptaPoliticas] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!aceptaPoliticas) {
      setError(MENSAJE_POLITICAS_REQUERIDAS);
      return;
    }

    setCargando(true);

    try {
      await register({ nombre, correo, password, aceptaPoliticas });
      setExito(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      const mensaje =
        err.response?.status === 409
          ? MENSAJE_CORREO_DUPLICADO
          : err.response?.data?.mensaje || MENSAJE_ERROR_GENERICO;
      setError(mensaje);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Crear cuenta</h1>

        {error && (
          <Alert type="error" message={error} onClose={() => setError("")} />
        )}
        {exito && (
          <Alert
            type="success"
            message="Cuenta creada con éxito. Te llevamos al login..."
          />
        )}

        <label className="auth-form__field">
          Nombre
          <Input
            name="nombre"
            placeholder="Tu nombre"
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
          />
        </label>

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

        <label className="auth-form__checkbox">
          <input
            type="checkbox"
            name="aceptaPoliticas"
            checked={aceptaPoliticas}
            onChange={(event) => setAceptaPoliticas(event.target.checked)}
          />
          Acepto las políticas de privacidad y los términos de uso
        </label>

        <Button
          type="submit"
          text={cargando ? "Creando cuenta..." : "Crear cuenta"}
          disabled={cargando || !aceptaPoliticas}
        />

        <div className="auth-form__links">
          <Link to="/login">¿Ya tenés cuenta? Iniciá sesión</Link>
        </div>
      </form>
    </div>
  );
}

export default Register;
