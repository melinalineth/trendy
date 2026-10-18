// Validación de las variables del contenedor ANTES de migrar o conectarse.
// Falla de inmediato (sin reintentos) con mensajes en español que dicen qué
// variable cambiar. Nunca imprime el VALOR de ninguna variable.
//
// Se corre desde docker-entrypoint.sh. Código de salida 1 si algo está mal.
const GENERAR_SECRETO = `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;
const CARACTERES_PROHIBIDOS = /[@:/?#%\s]/;

const problemas = [];

const esDeEjemplo = (valor) => /^changeme/i.test(valor ?? "");

// --- Secretos de ejemplo ----------------------------------------------------
const jwt = process.env.JWT_SECRET ?? "";
if (!jwt) {
  problemas.push(
    `Falta JWT_SECRET. Definilo en tu archivo de variables (.env.staging). Generá un secreto con:\n    ${GENERAR_SECRETO}`
  );
} else if (esDeEjemplo(jwt) || jwt.length < 16) {
  problemas.push(
    "JWT_SECRET es un valor de ejemplo (empieza por «changeme») o tiene menos de 16 caracteres. " +
      `Cambialo en .env.staging por un secreto propio. Generá uno con:\n    ${GENERAR_SECRETO}`
  );
}

const passwordAdmin = process.env.SEED_ADMIN_PASSWORD ?? "";
if (passwordAdmin && esDeEjemplo(passwordAdmin)) {
  problemas.push(
    "SEED_ADMIN_PASSWORD es un valor de ejemplo (empieza por «changeme»). Cambiala en .env.staging " +
      `por una contraseña propia (mínimo 8 caracteres). Podés generar una con:\n    ${GENERAR_SECRETO}`
  );
}

// --- DATABASE_URL -----------------------------------------------------------
const AYUDA_URL =
  "Revisá que MYSQL_USER/MYSQL_PASSWORD no tengan @ : / ? # % y que un $ se escriba $$ en el env-file de Compose.";

let url = null;
try {
  url = new URL(process.env.DATABASE_URL ?? "");
} catch {
  problemas.push(`DATABASE_URL no es una URL válida. ${AYUDA_URL}`);
}

const usuarioEsperado = process.env.MYSQL_USER;
const passwordEsperada = process.env.MYSQL_PASSWORD;

if (url) {
  if (url.protocol !== "mysql:" || !url.hostname) {
    problemas.push(`DATABASE_URL debe ser mysql://usuario:clave@host:puerto/base. ${AYUDA_URL}`);
  } else {
    let usuario;
    let password;
    try {
      usuario = decodeURIComponent(url.username);
      password = decodeURIComponent(url.password);
    } catch {
      problemas.push(`El usuario o la contraseña de DATABASE_URL no se pueden decodificar. ${AYUDA_URL}`);
    }

    const sospechoso =
      CARACTERES_PROHIBIDOS.test(usuarioEsperado ?? "") ||
      CARACTERES_PROHIBIDOS.test(passwordEsperada ?? "") ||
      (usuarioEsperado !== undefined && usuario !== undefined && usuario !== usuarioEsperado) ||
      (passwordEsperada !== undefined && password !== undefined && password !== passwordEsperada);

    if (sospechoso) {
      problemas.push(
        "El usuario o la contraseña de la base contienen caracteres que rompen la URL de conexión " +
          `o no coinciden con MYSQL_USER/MYSQL_PASSWORD. ${AYUDA_URL}`
      );
    }

    if (esDeEjemplo(passwordEsperada ?? password)) {
      problemas.push(
        "La contraseña de MySQL (MYSQL_PASSWORD) es un valor de ejemplo (empieza por «changeme»). " +
          `Cambiala en .env.staging (y MYSQL_ROOT_PASSWORD también). Generá una con:\n    ${GENERAR_SECRETO}`
      );
    }
  }
}

if (problemas.length > 0) {
  console.error("[entrypoint] ERROR: la configuración del backend no es válida:");
  for (const problema of problemas) console.error(`  - ${problema}`);
  console.error(
    "[entrypoint] Corregí el archivo de variables y volvé a levantar: docker compose -p trendy-staging --env-file .env.staging up -d --build"
  );
  process.exit(1);
}

console.log("[entrypoint] configuración válida");
