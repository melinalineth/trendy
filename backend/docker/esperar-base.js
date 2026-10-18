// Espera a que la base responda (hasta INTENTOS * ESPERA_MS). Lo corre
// docker-entrypoint.sh después de validar el entorno. Sale con 1 si la base no
// contesta a tiempo. Imprime el código/mensaje REAL del error, nunca valores
// de variables.
const mysql = require("mysql2/promise");

const INTENTOS = 30;
const ESPERA_MS = 2000;

(async () => {
  for (let i = 1; i <= INTENTOS; i++) {
    let conexion;
    try {
      conexion = await mysql.createConnection(process.env.DATABASE_URL);
      await conexion.query("SELECT 1");
      console.log(`[entrypoint] la base responde (intento ${i})`);
      await conexion.end();
      return;
    } catch (error) {
      const motivo = error?.code ?? error?.message ?? String(error);
      console.log(`[entrypoint] la base todavía no responde (${i}/${INTENTOS}): ${motivo}`);
      // Si llegó a conectar pero falló la consulta, no dejar la conexión abierta.
      if (conexion) await conexion.end().catch(() => {});
      await new Promise((resolver) => setTimeout(resolver, ESPERA_MS));
    }
  }

  console.error("[entrypoint] ERROR: la base no respondió a tiempo");
  process.exit(1);
})();
