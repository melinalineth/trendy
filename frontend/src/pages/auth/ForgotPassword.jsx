import { useState } from "react";
import { Link } from "react-router-dom";

import Input from "../../components/common/Input";
import Button from "../../components/common/Button";
import Alert from "../../components/common/Alert";
import authService from "../../services/auth.service";
import "./auth.css";

// El backend responde SIEMPRE el mismo mensaje, exista o no el correo, para
// no filtrar qué correos están registrados. Por eso el front nunca
// distingue entre "éxito" y "error" acá: ante cualquier resultado (incluso
// una falla de red) mostramos el mismo texto genérico.
const MENSAJE_GENERICO =
  "Si el correo ingresado existe en nuestro sistema, vas a recibir un email con instrucciones para restablecer tu contraseña.";

function ForgotPassword() {
  const [correo, setCorreo] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setCargando(true);

    try {
      await authService.recuperarPassword(correo);
    } catch {
      // Intencionalmente ignorado: el mensaje mostrado es siempre el mismo.
    } finally {
      setCargando(false);
      setEnviado(true);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Recuperar contraseña</h1>

        {enviado ? (
          <Alert type="success" message={MENSAJE_GENERICO} />
        ) : (
          <>
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

            <Button
              type="submit"
              text={cargando ? "Enviando..." : "Enviar instrucciones"}
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

export default ForgotPassword;
