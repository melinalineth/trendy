const authService = require("../services/auth.service");
const {
  registerSchema,
  loginSchema,
  recuperarPasswordSchema,
  restablecerPasswordSchema,
} = require("../dtos/auth.dto");

// RF-003: mismo mensaje genérico exista o no el correo.
const MENSAJE_RECUPERACION_GENERICO =
  "Si el correo está registrado, vas a recibir instrucciones para restablecer tu contraseña";

function formatearErroresZod(error) {
  return error.issues.map((issue) => issue.message).join(", ");
}

async function register(req, res) {
  const parseo = registerSchema.safeParse(req.body ?? {});
  if (!parseo.success) {
    return res.status(400).json({ error: formatearErroresZod(parseo.error) });
  }

  try {
    const usuario = await authService.registrar(parseo.data);
    return res.status(201).json(usuario);
  } catch (error) {
    // P2002 = violación de constraint unique (correo ya registrado)
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un usuario con ese correo" });
    }

    console.error(error);
    return res.status(500).json({ error: "Error al registrar usuario" });
  }
}

async function login(req, res) {
  const parseo = loginSchema.safeParse(req.body ?? {});
  if (!parseo.success) {
    return res.status(400).json({ error: formatearErroresZod(parseo.error) });
  }

  try {
    const resultado = await authService.login(parseo.data);
    return res.status(200).json(resultado);
  } catch (error) {
    if (error instanceof authService.CredencialesInvalidasError) {
      return res.status(401).json({ error: error.message });
    }

    console.error(error);
    return res.status(500).json({ error: "Error al iniciar sesión" });
  }
}

async function logout(req, res) {
  // Limitación conocida: JWT stateless no se puede invalidar server-side sin
  // blacklist/refresh tokens — mejora futura, no bloquea RF-002 para el MVP.
  return res.status(200).json({ mensaje: "Sesión cerrada" });
}

async function recuperarPassword(req, res) {
  const parseo = recuperarPasswordSchema.safeParse(req.body ?? {});
  if (!parseo.success) {
    return res.status(400).json({ error: formatearErroresZod(parseo.error) });
  }

  try {
    await authService.solicitarRecuperacion(parseo.data);
  } catch (error) {
    // No se revela el error real al cliente: se responde igual el mensaje
    // genérico más abajo, para no filtrar si el correo existe o no.
    console.error(error);
  }

  return res.status(200).json({ mensaje: MENSAJE_RECUPERACION_GENERICO });
}

async function restablecerPassword(req, res) {
  const parseo = restablecerPasswordSchema.safeParse(req.body ?? {});
  if (!parseo.success) {
    return res.status(400).json({ error: formatearErroresZod(parseo.error) });
  }

  try {
    await authService.restablecerPassword(parseo.data);
    return res.status(200).json({ mensaje: "Contraseña actualizada correctamente" });
  } catch (error) {
    if (error instanceof authService.TokenInvalidoError) {
      return res.status(400).json({ error: error.message });
    }

    console.error(error);
    return res.status(500).json({ error: "Error al restablecer la contraseña" });
  }
}

module.exports = {
  register,
  login,
  logout,
  recuperarPassword,
  restablecerPassword,
};
