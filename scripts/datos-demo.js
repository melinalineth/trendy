#!/usr/bin/env node
// Carga datos de demostración coherentes en la base LOCAL de desarrollo.
//
// Por qué existe: para presentar Trendy hace falta una tienda con vida (pedidos en
// todos los estados, ventas registradas y anuladas, stock bajo, varios responsables) y
// armarla a mano lleva más de una hora. Este script la arma en un par de minutos y
// sirve para que cualquiera del equipo reproduzca la misma demo.
//
// Uso (desde la raíz del repositorio, con el backend levantado en modo desarrollo):
//
//   node scripts/datos-demo.js            # carga los datos
//   node scripts/datos-demo.js --verificar # solo corre las comprobaciones previas
//   node scripts/datos-demo.js --ayuda
//
// CONTRASEÑA COMPARTIDA: todas las cuentas demo usan la misma. Si definís la variable
// de entorno DATOS_DEMO_PASSWORD (mínimo 8 caracteres, sin empezar por «changeme») se
// usa esa; si no, la constante PASSWORD_DEMO de más abajo, que es PÚBLICA (está en el
// repositorio). El script nunca imprime la contraseña. Ojo: el backend escucha en todas
// las interfaces de red (app.listen(PORT) sin host), así que con la demo cargada queda
// demo-admin@trendy.test (rol admin) con una clave conocida si usás la constante: corré
// la demo en una red de confianza o definí DATOS_DEMO_PASSWORD ANTES de la primera
// corrida (después no cambia la clave de las cuentas ya creadas).
//
// Qué crea (todo con correos @trendy.test y nombres ficticios):
//   - 2 cuentas de personal (admin y vendedor), creadas con prisma + hashPassword del
//     backend porque la API no tiene endpoint para eso (igual que crear-usuario.js).
//   - 4 clientes registrados por la API real, cada uno con una dirección principal en
//     Bogotá, Medellín, Cali y Barranquilla (coinciden con las zonas del seed).
//   - Contra entrega habilitado en Bogotá, Medellín y Cali; Barranquilla queda
//     deshabilitada (el cliente 4 deja un producto en el carrito para mostrar el rechazo).
//   - Ajustes de inventario por la API: dos entradas, tres variantes en stock bajo
//     (<= 5) y una agotada. Cambian el stock de 6 variantes EXISTENTES mediante
//     movimientos de ajuste (quedan en el historial de cada variante).
//   - 11 pedidos contra entrega repartidos entre los clientes 1 a 3, en todos los
//     estados, creados con las transiciones reales (la API genera el historial de
//     envío, las ventas, la anulación con «anuladaPor» y los movimientos de stock).
//
// Qué NO hace (límites):
//   - No crea pedidos de Mercado Pago: sin un access token real no se puede ejercitar.
//   - Las fechas se retrasan directamente en la base (la API siempre estampa «ahora»):
//     pedido, historial de envío, pago, venta y movimientos de stock de los pedidos se
//     reparten en los últimos ~14 días, y también la fecha de creación de las cuentas
//     que crea esta corrida (nunca la de una cuenta que ya existía). Es lo único que se
//     escribe fuera de la API, junto con las dos cuentas de personal.
//   - Un cliente NO puede cancelar un pedido (la API responde 403: la cancelación es
//     del personal, ERS §2.8.3). El pedido «cancelado a pedido del cliente» lo cancela
//     el vendedor mientras estaba pendiente.
//   - No resetea la base y NO BORRA NADA. Lo que sí modifica de lo existente es:
//       * habilita el contra entrega en las zonas Bogotá, Medellín y Cali (Barranquilla
//         no se toca: tiene que estar sin contra entrega; si estuviera habilitada el
//         script aborta antes de crear nada);
//       * cambia el stock de ~6 variantes existentes con movimientos de ajuste;
//       * la fecha de creación de las cuentas que crea (no la de las ya existentes).
//   - El número de pedido (PED-...) lleva incrustado el instante real de creación:
//     queda como está, solo se retrasan las fechas.
//
// Seguridad:
//   - Se niega a correr si el host de la API no es localhost / 127.0.0.1 (se puede
//     cambiar el puerto o el prefijo con la variable DATOS_DEMO_API) o si DATABASE_URL
//     (backend/.env) no apunta a un host local, o si trae en el query string claves de
//     conexión (host, socketPath, ...) que el driver usaría para desviar la conexión.
//   - LÍMITE de la guarda de la API: solo mira el host. Un localhost:3000 que sea un
//     túnel, o un backend que use OTRA base distinta de la de backend/.env, pasaría la
//     guarda. Mitigación: si la base es otra, el login de las cuentas de personal falla
//     con 401 y el script aborta, pero recién después de crear esas dos cuentas.
//   - Si ya hay clientes demo aborta con código 1 y no crea nada: «carga completa» si
//     están todos los pedidos, «carga incompleta» si faltan (en ese caso hay que usar una
//     base nueva o limpiar a mano; el script no borra ni ofrece un modo destructivo).
//   - Ante Ctrl+C o un error inesperado avisa si quedaron datos parciales.
//   - No sigue redirecciones HTTP (el login no se reenvía a otro origen).
//   - Nunca imprime contraseñas, tokens, hashes ni la URL de la base.
//
// Código de salida: 0 si cargó los datos (o si --verificar pasó); 1 ante cualquier error.

"use strict";

const path = require("node:path");
const { createRequire } = require("node:module");
const { parseArgs } = require("node:util");

const BACKEND = path.join(__dirname, "..", "backend");
// Resuelve dotenv, bcrypt y el cliente de Prisma desde backend/node_modules.
const requireBackend = createRequire(path.join(BACKEND, "package.json"));

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

// Credencial compartida por TODAS las cuentas demo. Descartable y solo para la base
// local de la demo. Mínimo 8 caracteres y sin empezar por «changeme».
const PASSWORD_DEMO = "Vitrina-Trendy-2026!";

// Contraseña efectiva de esta corrida (DATOS_DEMO_PASSWORD o PASSWORD_DEMO); la fija
// validarPasswordDemo() antes de hacer nada.
let passwordDemo = PASSWORD_DEMO;

const API_POR_DEFECTO = "http://localhost:3000/api/v1";
const HOSTS_LOCALES_API = ["localhost", "127.0.0.1"];
const HOSTS_LOCALES_DB = ["localhost", "127.0.0.1", "::1", "[::1]"];
// Claves del query string de DATABASE_URL que el driver usaría para cambiar a dónde se
// conecta (en minúsculas).
const CLAVES_DE_CONEXION_PROHIBIDAS = [
  "host",
  "hostname",
  "port",
  "socketpath",
  "localsocket",
  "sockpath",
  "pipe",
  "namedpipe",
  "localaddress",
  "stream",
  "uri",
  "url",
  "connectionstring",
];
const TIMEOUT_API_MS = 30000;

const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;
// Colombia no tiene horario de verano: America/Bogota es UTC-5 todo el año.
const DESFASE_BOGOTA_HORAS = 5;

const CUENTAS_PERSONAL = [
  {
    clave: "admin",
    correo: "demo-admin@trendy.test",
    nombre: "Administrador Demo",
    rol: "admin",
    antiguedadDias: 20,
  },
  {
    clave: "vendedor",
    correo: "demo-vendedor@trendy.test",
    nombre: "Vendedor Demo",
    rol: "vendedor",
    antiguedadDias: 20,
  },
];

// Cada cliente vive en una zona distinta del seed. La ciudad y el departamento de la
// dirección se toman de la zona real de la base (misma ortografía), no de estas
// constantes: acá solo sirven para encontrar la zona.
const CLIENTES = [
  {
    n: 1,
    nombre: "Laura Camila Rodríguez",
    zona: { ciudad: "Bogotá", departamento: "Cundinamarca" },
    telefono: "3105550142",
    calle: "Carrera 15 # 93-60, Apto 502",
    codigoPostal: "110221",
    referencia: "Edificio esquinero frente al parque",
    antiguedadDias: 15,
  },
  {
    n: 2,
    nombre: "Andrés Felipe Gómez",
    zona: { ciudad: "Medellín", departamento: "Antioquia" },
    telefono: "3205550187",
    calle: "Calle 10 # 43D-25, Local 101",
    codigoPostal: "050021",
    referencia: "Portería: preguntar por Andrés",
    antiguedadDias: 14,
  },
  {
    n: 3,
    nombre: "Mariana Ospina Cárdenas",
    zona: { ciudad: "Cali", departamento: "Valle del Cauca" },
    telefono: "3155550163",
    calle: "Avenida 6N # 28-45, Casa 12",
    codigoPostal: "760042",
    referencia: "Conjunto cerrado, torre B",
    antiguedadDias: 12,
  },
  {
    n: 4,
    nombre: "Juan David Martínez",
    zona: { ciudad: "Barranquilla", departamento: "Atlántico" },
    telefono: "3005550129",
    calle: "Carrera 53 # 76-30, Oficina 204",
    codigoPostal: "080020",
    referencia: "Dejar con recepción",
    antiguedadDias: 6,
  },
];

const correoCliente = (n) => `demo-cliente${n}@trendy.test`;

// Estado deseado de contra entrega por zona.
const ZONAS_DEMO = [
  { ciudad: "Bogotá", departamento: "Cundinamarca", contraEntrega: true },
  { ciudad: "Medellín", departamento: "Antioquia", contraEntrega: true },
  { ciudad: "Cali", departamento: "Valle del Cauca", contraEntrega: true },
  { ciudad: "Barranquilla", departamento: "Atlántico", contraEntrega: false },
];

// Movimientos de inventario por la API. Las variantes se buscan por SKU (el del seed:
// PRODUCTO-TALLA-COLOR sin tildes). Ninguna se usa en los pedidos de abajo.
const ENTRADAS = [
  {
    sku: "BLUSACASUAL-L-BLANCO",
    cantidad: 12,
    motivo: "Reposición de proveedor (remesa de la semana)",
    cuando: { dias: 14, hora: "09:10" },
  },
  {
    sku: "PANTALONCHINO-34-BEIGE",
    cantidad: 10,
    motivo: "Reposición de proveedor (remesa de la semana)",
    cuando: { dias: 14, hora: "09:25" },
  },
];

// `objetivo` es el stock con el que debe quedar la variante (si ya está por debajo no
// se hace nada). Con objetivo 0 queda agotada.
const AJUSTES_STOCK = [
  {
    sku: "CAMISETABASICA-L-NEGRO",
    objetivo: 4,
    tipo: "AJUSTE",
    motivo: "Conteo físico: prendas con defecto de costura",
    cuando: { dias: 1, hora: "10:30" },
  },
  {
    sku: "JEANCLASICO-30-AZUL",
    objetivo: 3,
    tipo: "AJUSTE",
    motivo: "Conteo físico: unidades apartadas para la tienda física",
    cuando: { dias: 1, hora: "10:45" },
  },
  {
    sku: "CHAQUETADECUERO-M-NEGRO",
    objetivo: 2,
    tipo: "SALIDA",
    motivo: "Despacho a la tienda física",
    cuando: { dias: 1, hora: "11:05" },
  },
  {
    sku: "VESTIDONEGRO-L-NEGRO",
    objetivo: 0,
    tipo: "SALIDA",
    motivo: "Despacho a la tienda física: última unidad",
    cuando: { dias: 1, hora: "11:20" },
  },
];

// Producto que el cliente 4 deja en el carrito para mostrar el rechazo de contra
// entrega en Barranquilla.
const SKU_CARRITO_CLIENTE_4 = "BLUSACASUAL-L-BLANCO";

// Secuencia manual de estados del pedido (pedidos-estados.md §3) y la clave de tiempo
// de cada paso.
const SECUENCIA = ["CONFIRMADO", "EN_PREPARACION", "ENVIADO", "EN_TRANSITO", "ENTREGADO"];
const CLAVE_TIEMPO = {
  CONFIRMADO: "confirmar",
  EN_PREPARACION: "preparar",
  ENVIADO: "enviar",
  EN_TRANSITO: "transitar",
  ENTREGADO: "entregar",
};
// Orden cronológico de todas las marcas de tiempo posibles de un pedido.
const ORDEN_TIEMPOS = [
  "creado",
  "pago",
  "confirmar",
  "preparar",
  "enviar",
  "transitar",
  "cobrar",
  "entregar",
  "cancelar",
];

// Pedidos contra entrega, en orden cronológico (así el id crece con la fecha).
//   cliente:   número de cliente (1 a 3; el 4 no puede comprar contra entrega).
//   cuando:    { dias, hora } = hora de Bogotá de hace N días, o { hoy: "a" | "b" } = los
//              dos pedidos más recientes (ver instantesDeHoy: horas razonables, nunca
//              futuras, sin importar a qué hora se corra el script).
//   items:     [sku, cantidad].
//   hasta:     último estado al que se lleva por la API ("PENDIENTE" = ninguno).
//   confirma:  quién pasa a CONFIRMADO ("admin" | "vendedor") = Responsable de la venta.
//   avanza:    quién hace el resto de las transiciones.
//   cobro:     registrar el cobro contra entrega antes de entregarlo.
//   cancela:   quién lo cancela al final (queda «Anulada por» si ya tenía venta).
//   min:       minutos desde la creación hasta cada paso (cronológicos).
const PEDIDOS = [
  {
    cliente: 1,
    cuando: { dias: 13, hora: "14:35" },
    items: [["CHAQUETADENIM-M-AZUL", 1], ["CAMISETABASICA-S-NEGRO", 2]],
    hasta: "ENTREGADO",
    confirma: "admin",
    avanza: "vendedor",
    cobro: true,
    min: { confirmar: 95, preparar: 260, enviar: 1500, transitar: 1740, cobrar: 2880, entregar: 2900 },
  },
  {
    cliente: 2,
    cuando: { dias: 11, hora: "10:20" },
    items: [["JEANCLASICO-32-AZUL", 1], ["CAMISAOXFORD-M-BLANCO", 1]],
    hasta: "ENTREGADO",
    confirma: "vendedor",
    avanza: "vendedor",
    cobro: true,
    min: { confirmar: 50, preparar: 200, enviar: 1350, transitar: 1620, cobrar: 2700, entregar: 2720 },
  },
  {
    // Cancelado por el vendedor después de salir: la venta queda ANULADA.
    cliente: 1,
    cuando: { dias: 9, hora: "16:50" },
    items: [["PANTALONCARGO-32-VERDE", 1], ["CAMISETAOVERSIZE-L-BLANCO", 1]],
    hasta: "ENVIADO",
    confirma: "admin",
    avanza: "admin",
    cancela: "vendedor",
    min: { confirmar: 70, preparar: 240, enviar: 1440, cancelar: 2450 },
  },
  {
    cliente: 3,
    cuando: { dias: 8, hora: "11:05" },
    items: [["VESTIDOFLORAL-M-FLORAL", 1], ["BLUSACASUAL-M-BLANCO", 2]],
    hasta: "ENTREGADO",
    confirma: "admin",
    avanza: "admin",
    cobro: true,
    min: { confirmar: 120, preparar: 300, enviar: 1380, transitar: 1700, cobrar: 2790, entregar: 2800 },
  },
  {
    // El cliente pidió que lo cancelaran antes de confirmarlo (cancela el personal).
    cliente: 2,
    cuando: { dias: 6, hora: "19:15" },
    items: [["CAMISETAPOLO-L-AZUL", 1]],
    hasta: "PENDIENTE",
    cancela: "vendedor",
    min: { cancelar: 825 },
  },
  {
    cliente: 3,
    cuando: { dias: 4, hora: "09:40" },
    items: [["CHAQUETABOMBER-L-NEGRO", 1], ["JEANSKINNY-30-AZUL", 1]],
    hasta: "EN_TRANSITO",
    confirma: "vendedor",
    avanza: "vendedor",
    min: { confirmar: 85, preparar: 210, enviar: 1450, transitar: 1700 },
  },
  {
    cliente: 1,
    cuando: { dias: 3, hora: "15:25" },
    items: [["FALDADENIM-M-AZUL", 1], ["CAMISETAESTAMPADA-M-BLANCO", 3]],
    hasta: "ENVIADO",
    confirma: "admin",
    avanza: "vendedor",
    min: { confirmar: 60, preparar: 180, enviar: 1300 },
  },
  {
    cliente: 2,
    cuando: { dias: 2, hora: "12:10" },
    items: [["PANTALONCHINO-32-BEIGE", 1], ["CAMISADELINO-L-BEIGE", 1]],
    hasta: "EN_PREPARACION",
    confirma: "admin",
    avanza: "admin",
    min: { confirmar: 75, preparar: 250 },
  },
  {
    cliente: 3,
    cuando: { dias: 1, hora: "16:20" },
    items: [["JEANMOM-30-AZULCLARO", 2]],
    hasta: "CONFIRMADO",
    confirma: "vendedor",
    min: { confirmar: 95 },
  },
  {
    cliente: 1,
    cuando: { hoy: "a" },
    items: [["VESTIDOROSA-M-ROSA", 1], ["BLUSACASUAL-S-BLANCO", 1]],
    hasta: "PENDIENTE",
    min: {},
  },
  {
    cliente: 2,
    cuando: { hoy: "b" },
    items: [["CAMISETABASICA-M-NEGRO", 2]],
    hasta: "PENDIENTE",
    min: {},
  },
];

const AYUDA = `Uso:
  node scripts/datos-demo.js              Carga los datos de demostración.
  node scripts/datos-demo.js --verificar  Solo corre las comprobaciones previas (no crea nada).
  node scripts/datos-demo.js --ayuda      Muestra esta ayuda.

Requisitos: backend levantado en modo desarrollo (por defecto ${API_POR_DEFECTO}),
migraciones y seed aplicados (roles, productos y zonas) y backend/.env con una
DATABASE_URL local (sin claves de conexión como host o socketPath en su query string).
Variables opcionales: DATOS_DEMO_API (solo hosts localhost o 127.0.0.1) y
DATOS_DEMO_PASSWORD (contraseña de las cuentas, mínimo 8 caracteres).

Crea 2 cuentas de personal, 4 clientes y 11 pedidos contra entrega en todos los estados,
con ventas y stock coherentes. La contraseña compartida de las cuentas es DATOS_DEMO_PASSWORD
si la definís; si no, la constante PASSWORD_DEMO del encabezado de scripts/datos-demo.js,
que es PÚBLICA (el backend escucha en todas las interfaces: usá una red de confianza o
definí DATOS_DEMO_PASSWORD antes de la primera corrida). Nunca se imprime.

No borra nada. Lo que modifica de lo existente: habilita contra entrega en Bogotá,
Medellín y Cali (Barranquilla no se toca), cambia el stock de ~6 variantes con
movimientos de ajuste y retrasa la fecha de creación de las cuentas que crea. Si la demo
ya está cargada (existen los demo-cliente1..4) aborta con código 1 sin crear nada, y si la
carga quedó incompleta lo dice: usá una base nueva o limpiá a mano.`;

// ---------------------------------------------------------------------------
// Errores y utilidades
// ---------------------------------------------------------------------------

// Error propio del script (argumentos, entorno, comprobaciones previas): su mensaje ya
// es el definitivo y se muestra completo.
class ErrorDeUso extends Error {}

// Respuesta inesperada de la API. Muestra paso, estado HTTP y el código/mensaje del
// error de la API; nunca el cuerpo de la petición (que puede llevar contraseñas).
class ErrorDeApi extends Error {
  constructor(paso, estado, datos) {
    const error = datos?.error;
    let codigo = "-";
    let mensaje = "sin detalle";

    if (typeof error === "string") {
      mensaje = error;
    } else if (error && typeof error === "object") {
      codigo = error.codigo ?? "-";
      mensaje = error.mensaje ?? mensaje;
      if (Array.isArray(error.detalles) && error.detalles.every((d) => typeof d === "string")) {
        mensaje += ` (${error.detalles.join("; ")})`;
      }
    }

    super(`Paso «${paso}»: la API respondió HTTP ${estado}, codigo ${codigo}: ${mensaje}`);
    this.paso = paso;
    this.estado = estado;
    this.codigo = codigo;
  }
}

function cargarDelBackend(modulo) {
  try {
    return requireBackend(modulo);
  } catch (error) {
    if (error?.code === "MODULE_NOT_FOUND") {
      throw new ErrorDeUso(
        `No se pudo cargar «${modulo}» del backend: faltan dependencias. Corré «npm ci» dentro de backend/ y volvé a intentar.`,
      );
    }
    throw error;
  }
}

function fallar(mensaje) {
  console.error(`Error: ${mensaje}`);
  process.exitCode = 1;
}

// Quita del texto cualquier valor secreto antes de mostrarlo. Se ignoran los valores de
// menos de 4 caracteres: enmascararlos rompería palabras comunes del propio mensaje.
function sinSecretos(texto, secretos) {
  return secretos
    .filter((secreto) => typeof secreto === "string" && secreto.length >= 4)
    .reduce((acumulado, secreto) => acumulado.split(secreto).join("***"), texto);
}

function passwordsDeLaUrl(url) {
  try {
    const { password } = new URL(url);
    return password ? [password, decodeURIComponent(password)] : [];
  } catch {
    return [];
  }
}

// Los errores de Prisma traen un recuadro de código antes de la causa real: se
// descartan esas líneas y se conserva el final.
function resumirError(error) {
  const lineas = String(error?.message ?? error)
    .split("\n")
    .filter(
      (linea) =>
        linea.trim() &&
        !/^\s*(→\s*)?\d+\s/.test(linea) &&
        !/invocation/i.test(linea) &&
        !linea.includes("datos-demo.js"),
    );
  const resumen = lineas.slice(-4).join("\n");

  return /pool timeout|ECONNREFUSED|Can't reach/i.test(resumen)
    ? `${resumen}\nNo se pudo conectar a la base: ¿está MySQL levantado y es correcta DATABASE_URL?`
    : resumen;
}

// Tokens que se van obteniendo: se agregan acá para enmascararlos si un error los repite.
const secretosDinamicos = new Set();

const normalizar = (texto) =>
  String(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

const pesos = (n) => `$${Number(n).toLocaleString("es-CO")}`;

function leerArgumentos() {
  try {
    return parseArgs({
      options: {
        ayuda: { type: "boolean", short: "h" },
        verificar: { type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    throw new ErrorDeUso(`${error.message}\n\n${AYUDA}`);
  }
}

// Resuelve la contraseña compartida: DATOS_DEMO_PASSWORD si está definida (no vacía) o,
// si no, la constante PASSWORD_DEMO. Nunca se imprime ni se acepta por argumento.
function validarPasswordDemo() {
  const deEntorno = process.env.DATOS_DEMO_PASSWORD;
  const usaEntorno = typeof deEntorno === "string" && deEntorno !== "";
  const candidata = usaEntorno ? deEntorno : PASSWORD_DEMO;
  const nombre = usaEntorno ? "DATOS_DEMO_PASSWORD" : "PASSWORD_DEMO";

  if (typeof candidata !== "string" || candidata.length < 8) {
    throw new ErrorDeUso(`${nombre} debe tener al menos 8 caracteres.`);
  }
  if (candidata.toLowerCase().startsWith("changeme")) {
    throw new ErrorDeUso(`${nombre} no puede empezar por «changeme».`);
  }

  passwordDemo = candidata;
}

// ---------------------------------------------------------------------------
// Guardas de seguridad (antes de cualquier petición o consulta)
// ---------------------------------------------------------------------------

// La API tiene que ser local: este script escribe datos de prueba y retrocede fechas.
function resolverApi() {
  const crudo = (process.env.DATOS_DEMO_API ?? API_POR_DEFECTO).trim();
  let url;

  try {
    url = new URL(crudo);
  } catch {
    throw new ErrorDeUso("DATOS_DEMO_API no es una URL válida (ejemplo: http://localhost:3000/api/v1).");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ErrorDeUso("DATOS_DEMO_API debe empezar por http:// o https://.");
  }
  if (url.username || url.password) {
    throw new ErrorDeUso("DATOS_DEMO_API no puede llevar usuario ni contraseña.");
  }
  if (!HOSTS_LOCALES_API.includes(url.hostname)) {
    throw new ErrorDeUso(
      `Por seguridad este script solo corre contra una API local (localhost o 127.0.0.1); el host «${url.hostname}» no lo es. No se hizo ninguna petición.`,
    );
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

// La base de datos también tiene que ser local. Se interpreta DATABASE_URL pero nunca
// se imprime (ni el host: solo se dice si es local o no).
function exigirBaseLocal() {
  cargarDelBackend("dotenv").config({ path: path.join(BACKEND, ".env"), quiet: true });

  const crudo = process.env.DATABASE_URL;
  if (!crudo) {
    throw new ErrorDeUso("DATABASE_URL no está definida: completá backend/.env (o exportala en el shell).");
  }

  let host;
  try {
    host = new URL(crudo).hostname;
  } catch {
    throw new ErrorDeUso("DATABASE_URL no se pudo interpretar como URL; revisá backend/.env.");
  }

  if (!HOSTS_LOCALES_DB.includes(host)) {
    throw new ErrorDeUso(
      "Por seguridad este script solo corre contra una base local: el host de DATABASE_URL no es localhost, 127.0.0.1 ni ::1. No se creó nada.",
    );
  }

  // El driver (mariadb) copia las claves del query string a sus opciones de conexión:
  // «mysql://u:p@localhost/db?host=remoto» pasaría el chequeo del host y se conectaría
  // a otro lado. Se rechaza cualquier query string con claves de conexión.
  const prohibidas = [...new URL(crudo).searchParams.keys()].filter((clave) =>
    CLAVES_DE_CONEXION_PROHIBIDAS.includes(clave.toLowerCase()),
  );
  if (prohibidas.length > 0) {
    throw new ErrorDeUso(
      `Por seguridad DATABASE_URL no puede traer en su query string claves de conexión (${[...new Set(prohibidas)].join(", ")}): podrían desviar la conexión a otro host. Quitalas de la URL. No se creó nada.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Cliente HTTP
// ---------------------------------------------------------------------------

function crearApi(base) {
  async function llamar(paso, metodo, ruta, { token, cuerpo, esperado = [200] } = {}) {
    const cabeceras = { Accept: "application/json" };
    if (token) cabeceras.Authorization = `Bearer ${token}`;
    if (cuerpo !== undefined) cabeceras["Content-Type"] = "application/json";

    let respuesta;
    try {
      respuesta = await fetch(`${base}${ruta}`, {
        method: metodo,
        headers: cabeceras,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(TIMEOUT_API_MS),
        // Un 3xx no se sigue: reenviaría el login (con la contraseña) a otro origen.
        redirect: "error",
      });
    } catch (error) {
      if (/redirect/i.test(String(error?.cause?.message ?? error?.message ?? ""))) {
        throw new ErrorDeUso(
          `Paso «${paso}»: la API respondió con una redirección y el script no las sigue (podría reenviar las credenciales a otro origen). Revisá DATOS_DEMO_API.`,
        );
      }
      const causa = error?.cause?.code ?? error?.name ?? "error de red";
      throw new ErrorDeUso(
        `Paso «${paso}»: no se pudo hablar con la API (${causa}). ¿Está el backend levantado?`,
      );
    }

    const texto = await respuesta.text();
    let datos = null;
    try {
      datos = texto ? JSON.parse(texto) : null;
    } catch {
      datos = null;
    }

    if (!esperado.includes(respuesta.status)) {
      throw new ErrorDeApi(paso, respuesta.status, datos);
    }

    return { estado: respuesta.status, datos };
  }

  return { llamar };
}

// ---------------------------------------------------------------------------
// Tiempos
// ---------------------------------------------------------------------------

// Fecha de hoy en Bogotá (año, mes 0-11, día).
function hoyEnBogota(ahora) {
  const local = new Date(ahora.getTime() - DESFASE_BOGOTA_HORAS * 60 * MIN);
  return { anio: local.getUTCFullYear(), mes: local.getUTCMonth(), dia: local.getUTCDate() };
}

// { dias, hora: "HH:MM" } -> instante: esa hora de Bogotá de hace `dias` días.
function instanteDe(ahora, { dias, hora }) {
  const { anio, mes, dia } = hoyEnBogota(ahora);
  const [hh, mm] = hora.split(":").map(Number);
  return new Date(Date.UTC(anio, mes, dia - dias, hh + DESFASE_BOGOTA_HORAS, mm));
}

// Instantes de los dos pedidos pendientes más recientes. Hora razonable (07:00 a 21:00
// en Bogotá), nunca futura (tope: ahora - 10 min) y separados por 45 min como mínimo.
// Normalmente son «hoy 09:30» y «hoy 14:20»; si todavía es muy temprano para que quepan
// hoy a partir de las 07:00, van al final de la tarde de ayer (después del pedido anterior).
function instantesDeHoy(ahora) {
  const tope = ahora.getTime() - 10 * MIN;
  const b = Math.min(instanteDe(ahora, { dias: 0, hora: "14:20" }).getTime(), tope);
  const a = Math.min(instanteDe(ahora, { dias: 0, hora: "09:30" }).getTime(), b - 45 * MIN);

  if (a < instanteDe(ahora, { dias: 0, hora: "07:00" }).getTime()) {
    return {
      a: instanteDe(ahora, { dias: 1, hora: "18:30" }),
      b: instanteDe(ahora, { dias: 1, hora: "20:15" }),
    };
  }

  return { a: new Date(a), b: new Date(b) };
}

function instanteInicial(ahora, cuando) {
  return cuando.hoy !== undefined ? instantesDeHoy(ahora)[cuando.hoy] : instanteDe(ahora, cuando);
}

// Pasos de la API que va a recorrer un pedido, según su plan.
function pasosDelPedido(plan) {
  const hasta = plan.hasta === "PENDIENTE" ? -1 : SECUENCIA.indexOf(plan.hasta);
  return SECUENCIA.slice(0, hasta + 1);
}

// Marcas de tiempo del pedido: creación, registro del pago (+2 min), cada paso y la
// cancelación. Valida que sean estrictamente crecientes y que ninguna esté en el futuro.
function calcularTiempos(plan, ahora, etiqueta) {
  const base = instanteInicial(ahora, plan.cuando);
  const t = { creado: base, pago: new Date(base.getTime() + 2 * MIN) };

  const claves = pasosDelPedido(plan).map((estado) => CLAVE_TIEMPO[estado]);
  if (plan.cobro) claves.push("cobrar");
  if (plan.cancela) claves.push("cancelar");

  for (const clave of claves) {
    const minutos = plan.min?.[clave];
    if (minutos === undefined) {
      throw new ErrorDeUso(`Plan de demo inválido (${etiqueta}): falta el tiempo «${clave}».`);
    }
    t[clave] = new Date(base.getTime() + minutos * MIN);
  }

  const presentes = ORDEN_TIEMPOS.filter((clave) => t[clave]);
  for (let i = 1; i < presentes.length; i++) {
    if (t[presentes[i]] <= t[presentes[i - 1]]) {
      throw new ErrorDeUso(
        `Plan de demo inválido (${etiqueta}): «${presentes[i]}» no es posterior a «${presentes[i - 1]}».`,
      );
    }
  }
  if (t[presentes.at(-1)] >= new Date(ahora.getTime() - MIN)) {
    throw new ErrorDeUso(`Plan de demo inválido (${etiqueta}): hay una fecha en el futuro.`);
  }

  return t;
}

// Valida los tiempos de TODOS los pedidos para el instante `ahora` (función pura, sin
// base ni red). Devuelve las marcas de cada pedido; lanza ErrorDeUso si algo no cierra.
function comprobarPlanDeTiempos(ahora) {
  const todos = PEDIDOS.map((plan, i) => calcularTiempos(plan, ahora, `pedido ${i + 1}`));

  todos.forEach((t, i) => {
    for (const [clave, instante] of Object.entries(t)) {
      const local = new Date(instante.getTime() - DESFASE_BOGOTA_HORAS * 60 * MIN);
      const minutosDelDia = local.getUTCHours() * 60 + local.getUTCMinutes();
      if (minutosDelDia < 7 * 60 || minutosDelDia > 21 * 60) {
        throw new ErrorDeUso(
          `Plan de demo inválido (pedido ${i + 1}): «${clave}» cae fuera del horario de 07:00 a 21:00 (Bogotá).`,
        );
      }
    }
    if (i > 0 && t.creado <= todos[i - 1].creado) {
      throw new ErrorDeUso(`Plan de demo inválido (pedido ${i + 1}): se crea antes que el pedido anterior.`);
    }
  });

  return todos;
}

// ---------------------------------------------------------------------------
// Comprobaciones previas (solo lectura)
// ---------------------------------------------------------------------------

async function comprobarBackend(api) {
  const { datos } = await api.llamar("comprobar el backend", "GET", "/health");
  if (datos?.estado !== "ok") {
    throw new ErrorDeUso("El backend respondió, pero su healthcheck no dice «ok»: ¿no tiene acceso a la base?");
  }
}

async function comprobarEntorno(prisma, hashes, ahora) {
  // 1. Roles del seed.
  const roles = await prisma.rol.findMany({ where: { nombre: { in: ["admin", "vendedor", "cliente"] } } });
  const rolPorNombre = new Map(roles.map((rol) => [rol.nombre, rol]));
  for (const nombre of ["admin", "vendedor", "cliente"]) {
    if (!rolPorNombre.has(nombre)) {
      throw new ErrorDeUso(
        `El rol «${nombre}» no existe en la base. Corré antes el seed: npx prisma db seed --config prisma7.config.ts (desde backend/).`,
      );
    }
  }

  // 2. Protección contra una segunda corrida: ningún cliente demo puede existir. Se
  //    distingue una carga completa de una incompleta (corrida interrumpida).
  const correosClientes = CLIENTES.map((c) => correoCliente(c.n));
  const previos = await prisma.usuario.findMany({
    where: { correo: { in: correosClientes } },
    select: { correo: true },
    orderBy: { correo: "asc" },
  });
  if (previos.length > 0) {
    const pedidosPrevios = await prisma.pedido.findMany({
      where: { usuario: { correo: { in: correosClientes } } },
      select: { creadoEn: true },
      orderBy: { creadoEn: "asc" },
    });
    // En una carga completa el pedido más viejo se retrasó ~13 días; si no, la
    // corrida murió antes de retrasar las fechas.
    const fechasRetrasadas =
      pedidosPrevios.length > 0 && pedidosPrevios[0].creadoEn < new Date(ahora.getTime() - 5 * DIA);
    const completa =
      previos.length === CLIENTES.length && pedidosPrevios.length >= PEDIDOS.length && fechasRetrasadas;

    if (completa) {
      throw new ErrorDeUso(
        `Los datos de demo ya están cargados (existen ${previos.map((u) => u.correo).join(", ")} y sus ${pedidosPrevios.length} pedidos). ` +
          "No se creó nada: este script no repite ni borra. Para volver a cargar la demo usá una base nueva.",
      );
    }

    throw new ErrorDeUso(
      `CARGA INCOMPLETA: hay ${previos.length} de ${CLIENTES.length} clientes demo y ${pedidosPrevios.length} de ${PEDIDOS.length} pedidos demo` +
        `${pedidosPrevios.length >= PEDIDOS.length && !fechasRetrasadas ? " (con las fechas sin retrasar)" : ""}: ` +
        "una corrida anterior se interrumpió a mitad de camino. No se creó nada y el script no puede reanudarla ni borrar lo que quedó. " +
        "Qué hacer: usá una base nueva (por ejemplo, restaurá un respaldo anterior a la carga) o limpiá a mano los datos demo " +
        "(las cuentas @trendy.test, sus pedidos y los movimientos de inventario de la demo) y volvé a correr el script.",
    );
  }

  // 3. Cuentas de personal ya existentes: deben tener el rol esperado y la clave demo.
  for (const cuenta of CUENTAS_PERSONAL) {
    const existente = await prisma.usuario.findUnique({
      where: { correo: cuenta.correo },
      include: { rol: true },
    });
    if (!existente) continue;

    if (existente.rol.nombre !== cuenta.rol) {
      throw new ErrorDeUso(
        `${cuenta.correo} ya existe con rol ${existente.rol.nombre} (se esperaba ${cuenta.rol}); no se modificó nada.`,
      );
    }
    if (!(await hashes.comparePassword(passwordDemo, existente.passwordHash))) {
      throw new ErrorDeUso(
        `${cuenta.correo} ya existe con una contraseña distinta de la de la demo (DATOS_DEMO_PASSWORD o PASSWORD_DEMO); no se modificó nada y no se podría iniciar sesión con ella.`,
      );
    }
  }

  // 4. Zonas de cobertura: activas y con tarifa vigente.
  const zonasDb = await prisma.zonaCobertura.findMany({
    include: { tarifas: { where: { estado: "ACTIVO" } } },
  });
  const zonas = new Map();
  for (const deseada of ZONAS_DEMO) {
    const zona = zonasDb.find(
      (z) => normalizar(z.ciudad) === normalizar(deseada.ciudad) && normalizar(z.departamento) === normalizar(deseada.departamento),
    );
    if (!zona) {
      throw new ErrorDeUso(
        `No existe la zona de cobertura ${deseada.ciudad}, ${deseada.departamento}: corré el seed (npx prisma db seed --config prisma7.config.ts).`,
      );
    }
    if (zona.estado !== "ACTIVO") {
      throw new ErrorDeUso(`La zona ${zona.ciudad} está inactiva: activala antes de cargar la demo.`);
    }
    if (zona.tarifas.length === 0) {
      throw new ErrorDeUso(`La zona ${zona.ciudad} no tiene una tarifa de envío activa.`);
    }
    // Barranquilla no se toca: tiene que estar sin contra entrega para mostrar el rechazo.
    if (!deseada.contraEntrega && zona.permiteContraEntrega) {
      throw new ErrorDeUso(
        `La zona ${zona.ciudad} tiene el contra entrega habilitado y la demo necesita que no lo tenga (el script no la modifica): deshabilitalo desde /admin/envios y volvé a correr.`,
      );
    }
    zonas.set(normalizar(deseada.ciudad), {
      id: zona.id,
      ciudad: zona.ciudad,
      departamento: zona.departamento,
      tarifa: Number(zona.tarifas[0].costo),
      contraEntregaActual: zona.permiteContraEntrega,
      contraEntregaDeseado: deseada.contraEntrega,
    });
  }

  // 5. Variantes: existen, de productos activos y con stock para todos los pedidos.
  const necesidad = new Map();
  for (const plan of PEDIDOS) {
    for (const [sku, cantidad] of plan.items) {
      necesidad.set(sku, (necesidad.get(sku) ?? 0) + cantidad);
    }
  }
  const skus = [
    ...new Set([
      ...necesidad.keys(),
      ...ENTRADAS.map((e) => e.sku),
      ...AJUSTES_STOCK.map((a) => a.sku),
      SKU_CARRITO_CLIENTE_4,
    ]),
  ];
  const variantesDb = await prisma.variante.findMany({
    where: { sku: { in: skus } },
    include: { producto: { select: { nombre: true, precio: true, estado: true } } },
  });
  const variantes = new Map(variantesDb.map((v) => [v.sku, v]));

  const faltantes = skus.filter((sku) => !variantes.has(sku));
  if (faltantes.length > 0) {
    throw new ErrorDeUso(
      `Faltan variantes del catálogo del seed (${faltantes.join(", ")}): el script espera los 20 productos del seed original.`,
    );
  }
  for (const [sku, requerido] of necesidad) {
    const variante = variantes.get(sku);
    if (variante.producto.estado !== "ACTIVO") {
      throw new ErrorDeUso(`El producto de ${sku} está inactivo: no se puede vender.`);
    }
    if (variante.stock < requerido) {
      throw new ErrorDeUso(
        `Stock insuficiente de ${sku}: hay ${variante.stock} y los pedidos de demo necesitan ${requerido}.`,
      );
    }
  }
  const sinPrecioEntero = [...necesidad.keys()].filter((sku) => !Number.isInteger(Number(variantes.get(sku).producto.precio)));
  if (sinPrecioEntero.length > 0) {
    throw new ErrorDeUso(`Hay productos con precio con centavos (${sinPrecioEntero.join(", ")}): el total esperado no se podría verificar.`);
  }

  // 6. El plan de tiempos es válido (error de programación si no lo fuera): cada pedido
  //    es cronológico, ninguna marca es futura, todas caen entre las 07:00 y las 21:00
  //    de Bogotá y los pedidos se crean en orden (el id crece con la fecha).
  comprobarPlanDeTiempos(ahora);

  return { rolPorNombre, zonas, variantes };
}

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------

function paso(texto) {
  console.log(`- ${texto}`);
}

async function iniciarSesion(api, correo, paso_) {
  const { datos } = await api.llamar(paso_, "POST", "/auth/login", {
    cuerpo: { correo, password: passwordDemo },
  });
  secretosDinamicos.add(datos.token);
  return { token: datos.token, id: datos.usuario.id, correo };
}

async function crearPersonal(prisma, hashes, rolPorNombre) {
  const creadas = [];

  for (const cuenta of CUENTAS_PERSONAL) {
    const existente = await prisma.usuario.findUnique({ where: { correo: cuenta.correo } });
    if (existente) continue;

    await prisma.usuario.create({
      data: {
        nombre: cuenta.nombre,
        correo: cuenta.correo,
        passwordHash: await hashes.hashPassword(passwordDemo),
        rolId: rolPorNombre.get(cuenta.rol).id,
      },
    });
    creadas.push(cuenta.correo);
  }

  return creadas;
}

async function registrarClientes(api, zonas) {
  const clientes = new Map();

  for (const cliente of CLIENTES) {
    const correo = correoCliente(cliente.n);
    const etiqueta = `cliente ${cliente.n}`;

    await api.llamar(`registrar ${etiqueta}`, "POST", "/auth/register", {
      cuerpo: { nombre: cliente.nombre, correo, password: passwordDemo, aceptaPoliticas: true },
      esperado: [201],
    });
    const sesion = await iniciarSesion(api, correo, `iniciar sesión ${etiqueta}`);

    const zona = zonas.get(normalizar(cliente.zona.ciudad));
    const { datos: direccion } = await api.llamar(`crear dirección ${etiqueta}`, "POST", "/direcciones", {
      token: sesion.token,
      cuerpo: {
        destinatario: cliente.nombre,
        telefono: cliente.telefono,
        calle: cliente.calle,
        ciudad: zona.ciudad,
        departamento: zona.departamento,
        codigoPostal: cliente.codigoPostal,
        referencia: cliente.referencia,
        esPrincipal: true,
      },
      esperado: [201],
    });

    clientes.set(cliente.n, { ...cliente, ...sesion, correo, direccionId: direccion.id, zona });
  }

  return clientes;
}

async function configurarZonas(api, admin, zonas) {
  const { datos: listado } = await api.llamar("listar zonas", "GET", "/zonas-cobertura", { token: admin.token });
  const cambios = [];

  for (const zona of zonas.values()) {
    // Solo se HABILITA. Las zonas que deben quedar sin contra entrega (Barranquilla) no se
    // tocan: la comprobación previa ya exigió que lo estén.
    if (!zona.contraEntregaDeseado) continue;

    const actual = listado.find((z) => z.id === zona.id);
    if (actual && actual.permiteContraEntrega === true) continue;

    await api.llamar(`contra entrega en ${zona.ciudad}`, "PATCH", `/zonas-cobertura/${zona.id}/contra-entrega`, {
      token: admin.token,
      cuerpo: { permiteContraEntrega: true },
    });
    cambios.push(`${zona.ciudad}: habilitada`);
  }

  return cambios;
}

// Movimientos de inventario por la API. Devuelve [{ id, cuando }] para retroceder su fecha.
async function ajustarInventario(api, admin, variantes, ahora) {
  const movimientos = [];

  const registrar = async (nombrePaso, variante, cantidad, tipoAjuste, motivo, cuando) => {
    const { datos } = await api.llamar(nombrePaso, "POST", "/inventario/ajustes", {
      token: admin.token,
      cuerpo: { varianteId: variante.id, cantidad, tipoAjuste, motivo },
      esperado: [201],
    });
    movimientos.push({ id: datos.movimiento.id, cuando: instanteDe(ahora, cuando) });
  };

  for (const entrada of ENTRADAS) {
    await registrar(`entrada de ${entrada.sku}`, variantes.get(entrada.sku), entrada.cantidad, "ENTRADA", entrada.motivo, entrada.cuando);
  }

  // El stock actual se lee de la API (la base puede haber cambiado desde la comprobación).
  const { datos: inventario } = await api.llamar("leer inventario", "GET", "/inventario", { token: admin.token });
  const stockActual = new Map(inventario.map((v) => [v.sku, v.stock]));

  for (const ajuste of AJUSTES_STOCK) {
    const actual = stockActual.get(ajuste.sku);
    if (actual === undefined || actual <= ajuste.objetivo) continue;

    await registrar(
      `bajar stock de ${ajuste.sku}`,
      variantes.get(ajuste.sku),
      ajuste.objetivo - actual,
      ajuste.tipo,
      ajuste.motivo,
      ajuste.cuando,
    );
  }

  return movimientos;
}

async function crearPedido(api, plan, indice, clientes, sesiones, variantes, ahora) {
  const etiqueta = `pedido ${indice + 1}`;
  const cliente = clientes.get(plan.cliente);
  const tiempos = calcularTiempos(plan, ahora, etiqueta);

  for (const [sku, cantidad] of plan.items) {
    await api.llamar(`${etiqueta}: agregar ${sku} al carrito`, "POST", "/carrito/items", {
      token: cliente.token,
      cuerpo: { varianteId: variantes.get(sku).id, cantidad },
      esperado: [201],
    });
  }

  const { datos: creado } = await api.llamar(`${etiqueta}: crear pedido`, "POST", "/pedidos", {
    token: cliente.token,
    cuerpo: { direccionId: cliente.direccionId, metodoPago: "CONTRA_ENTREGA" },
    esperado: [201],
  });
  const pedido = creado.pedido;

  await api.llamar(`${etiqueta}: registrar pago contra entrega`, "POST", "/pagos/contra-entrega", {
    token: cliente.token,
    cuerpo: { pedidoId: pedido.id },
    esperado: [200, 201],
  });

  for (const estado of pasosDelPedido(plan)) {
    const actor = estado === "CONFIRMADO" ? plan.confirma : plan.avanza;

    if (estado === "ENTREGADO" && plan.cobro) {
      await api.llamar(`${etiqueta}: registrar cobro contra entrega`, "PATCH", `/pagos/${pedido.id}/confirmar-recepcion`, {
        token: sesiones[plan.avanza].token,
      });
    }

    await api.llamar(`${etiqueta}: pasar a ${estado}`, "PATCH", `/pedidos/${pedido.id}/estado`, {
      token: sesiones[actor].token,
      cuerpo: { estado },
    });
  }

  if (plan.cancela) {
    await api.llamar(`${etiqueta}: cancelar`, "PATCH", `/pedidos/${pedido.id}/cancelar`, {
      token: sesiones[plan.cancela].token,
    });
  }

  const subtotal = plan.items.reduce(
    (suma, [sku, cantidad]) => suma + Number(variantes.get(sku).producto.precio) * cantidad,
    0,
  );

  return {
    plan,
    etiqueta,
    cliente,
    pedidoId: pedido.id,
    numero: pedido.numero,
    totalApi: pedido.total,
    totalEsperado: subtotal + cliente.zona.tarifa,
    estadoFinal: plan.cancela ? "CANCELADO" : plan.hasta,
    confirmado: plan.hasta !== "PENDIENTE",
    tiempos,
  };
}

// El cliente 4 vive en Barranquilla, sin contra entrega: intenta comprar y el rechazo
// tiene que ser el esperado. Su carrito queda con un producto para repetirlo en vivo.
async function verificarRechazoBarranquilla(api, cliente4, variantes) {
  await api.llamar("cliente 4: agregar al carrito", "POST", "/carrito/items", {
    token: cliente4.token,
    cuerpo: { varianteId: variantes.get(SKU_CARRITO_CLIENTE_4).id, cantidad: 1 },
    esperado: [201],
  });

  const { estado, datos } = await api.llamar(
    "cliente 4: contra entrega en Barranquilla",
    "POST",
    "/pedidos",
    {
      token: cliente4.token,
      cuerpo: { direccionId: cliente4.direccionId, metodoPago: "CONTRA_ENTREGA" },
      esperado: [201, 409],
    },
  );

  if (estado === 201) {
    throw new ErrorDeUso(
      "Se creó un pedido en Barranquilla: la zona tiene el contra entrega habilitado. Revisá la zona (el pedido quedó pendiente en la base).",
    );
  }
  if (datos?.error?.codigo !== "CONTRA_ENTREGA_NO_DISPONIBLE") {
    throw new ErrorDeUso(
      `Se esperaba el rechazo CONTRA_ENTREGA_NO_DISPONIBLE en Barranquilla y la API respondió HTTP 409, codigo ${datos?.error?.codigo ?? "-"}.`,
    );
  }
}

// Retrasa las fechas en la base: lo único que la API no puede hacer.
// `cuentasCreadas`: correos de las cuentas de personal que creó ESTA corrida. Solo a esas
// se les retrasa la fecha de creación; una cuenta que ya existía no se toca. Los clientes
// siempre son de esta corrida (la comprobación previa exige que no existieran).
async function retrasarFechas(prisma, registros, movimientosInventario, ahora, cuentasCreadas) {
  for (const cuenta of CUENTAS_PERSONAL) {
    if (!cuentasCreadas.includes(cuenta.correo)) continue;

    await prisma.usuario.update({
      where: { correo: cuenta.correo },
      data: { creadoEn: new Date(ahora.getTime() - cuenta.antiguedadDias * DIA) },
    });
  }
  for (const cliente of CLIENTES) {
    await prisma.usuario.update({
      where: { correo: correoCliente(cliente.n) },
      data: { creadoEn: new Date(ahora.getTime() - cliente.antiguedadDias * DIA) },
    });
  }

  for (const movimiento of movimientosInventario) {
    await prisma.inventarioMovimiento.update({ where: { id: movimiento.id }, data: { creadoEn: movimiento.cuando } });
  }

  for (const registro of registros) {
    const { pedidoId, tiempos: t, plan } = registro;

    await prisma.pedido.update({ where: { id: pedidoId }, data: { creadoEn: t.creado } });

    // Historial de envío: la primera fila (alta, sin estado anterior) es de la creación;
    // el resto, de cada paso de envío.
    const info = await prisma.infoEnvio.findUnique({
      where: { pedidoId },
      include: { historial: { orderBy: { id: "asc" } } },
    });
    let ultimo = t.creado;
    for (const fila of info.historial) {
      const cuando = fila.estadoAnterior === null ? t.creado : t[CLAVE_TIEMPO[fila.estadoNuevo]];
      await prisma.historialEstadoEnvio.update({ where: { id: fila.id }, data: { creadoEn: cuando } });
      if (cuando > ultimo) ultimo = cuando;
    }
    await prisma.infoEnvio.update({ where: { id: info.id }, data: { actualizadoEn: ultimo } });

    // Pago: su última actualización es el cobro, la cancelación o el registro.
    const cuandoPago = plan.cancela ? t.cancelar : plan.cobro ? t.cobrar : t.pago;
    await prisma.pago.update({ where: { pedidoId }, data: { actualizadoEn: cuandoPago } });

    if (registro.confirmado) {
      await prisma.venta.update({
        where: { pedidoId },
        data: { registradaEn: t.confirmar, ...(plan.cancela ? { anuladaEn: t.cancelar } : {}) },
      });
    }

    // Movimientos de stock del pedido: la reserva al crearlo y la reposición al cancelarlo.
    await prisma.inventarioMovimiento.updateMany({
      where: { motivo: `Pedido confirmado (pedido #${pedidoId})` },
      data: { creadoEn: t.creado },
    });
    if (plan.cancela) {
      await prisma.inventarioMovimiento.updateMany({
        where: { motivo: `Pedido cancelado (pedido #${pedidoId})` },
        data: { creadoEn: t.cancelar },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Verificación de consistencia (solo lectura) y resumen
// ---------------------------------------------------------------------------

async function comprobarConsistencia(prisma, registros, sesiones, ahora) {
  const fallas = [];
  let comprobaciones = 0;
  const comprobar = (condicion, mensaje) => {
    comprobaciones++;
    if (!condicion) fallas.push(mensaje);
  };

  for (const registro of registros) {
    const { plan, pedidoId, etiqueta } = registro;
    const pedido = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { venta: true, pago: true, infoEnvio: { include: { historial: { orderBy: { id: "asc" } } } } },
    });

    comprobar(pedido.estado === registro.estadoFinal, `${etiqueta}: estado ${pedido.estado} en vez de ${registro.estadoFinal}`);
    comprobar(
      Number(pedido.total) === registro.totalEsperado && Number(pedido.total) === Number(registro.totalApi),
      `${etiqueta}: el total no coincide con precios + envío`,
    );
    comprobar(pedido.creadoEn <= ahora, `${etiqueta}: pedido con fecha futura`);

    const historial = pedido.infoEnvio.historial;
    comprobar(historial.length > 0 && historial[0].creadoEn >= pedido.creadoEn, `${etiqueta}: el historial empieza antes que el pedido`);
    comprobar(
      historial.every((fila, i) => i === 0 || fila.creadoEn > historial[i - 1].creadoEn),
      `${etiqueta}: el historial de envío no es cronológico`,
    );
    comprobar(
      pedido.infoEnvio.actualizadoEn.getTime() === historial.at(-1).creadoEn.getTime(),
      `${etiqueta}: InfoEnvio.actualizadoEn no coincide con el último cambio`,
    );

    if (registro.confirmado) {
      const venta = pedido.venta;
      comprobar(Boolean(venta), `${etiqueta}: confirmado sin venta`);
      if (venta) {
        comprobar(Number(venta.total) === Number(pedido.total), `${etiqueta}: venta.total distinto de pedido.total`);
        comprobar(venta.registradaEn >= pedido.creadoEn, `${etiqueta}: la venta es anterior al pedido`);
        comprobar(venta.responsableId === sesiones[plan.confirma].id, `${etiqueta}: responsable de la venta inesperado`);
        comprobar(
          venta.estado === (plan.cancela ? "ANULADA" : "REGISTRADA"),
          `${etiqueta}: estado de la venta ${venta.estado}`,
        );
        if (plan.cancela) {
          comprobar(venta.anuladaPorId === sesiones[plan.cancela].id, `${etiqueta}: «anuladaPor» inesperado`);
          comprobar(venta.anuladaEn && venta.anuladaEn >= venta.registradaEn, `${etiqueta}: anulada antes de registrarse`);
        } else {
          comprobar(venta.anuladaEn === null && venta.anuladaPorId === null, `${etiqueta}: venta vigente con datos de anulación`);
        }
      }
    } else {
      comprobar(!pedido.venta, `${etiqueta}: pedido sin confirmar con venta`);
    }

    const esperadoPago = plan.cancela ? "CANCELADO" : plan.cobro ? "APROBADO" : "PENDIENTE";
    comprobar(pedido.pago?.estado === esperadoPago, `${etiqueta}: pago ${pedido.pago?.estado} en vez de ${esperadoPago}`);
  }

  const negativas = await prisma.variante.count({ where: { stock: { lt: 0 } } });
  comprobar(negativas === 0, "hay variantes con stock negativo");

  return { comprobaciones, fallas };
}

async function imprimirResumen(api, prisma, admin, registros, comprobacion, cuentasCreadas) {
  // Estados de los pedidos tal como los ve la API.
  const porEstado = new Map();
  for (const registro of registros) {
    const { datos } = await api.llamar(`leer ${registro.etiqueta}`, "GET", `/pedidos/${registro.pedidoId}`, { token: admin.token });
    porEstado.set(datos.estado, (porEstado.get(datos.estado) ?? 0) + 1);
  }

  const ventas = await prisma.venta.findMany({ where: { pedidoId: { in: registros.map((r) => r.pedidoId) } } });
  const porEstadoVenta = new Map();
  for (const venta of ventas) porEstadoVenta.set(venta.estado, (porEstadoVenta.get(venta.estado) ?? 0) + 1);

  const { datos: zonas } = await api.llamar("leer zonas", "GET", "/zonas-cobertura", { token: admin.token });
  const { datos: inventario } = await api.llamar("leer inventario", "GET", "/inventario", { token: admin.token });
  const stock = new Map(inventario.map((v) => [v.sku, v.stock]));

  console.log("\n=== Resumen de la demo ===");
  console.log(`\nPedidos creados: ${registros.length}`);
  for (const [estado, cantidad] of [...porEstado].sort()) console.log(`  ${estado}: ${cantidad}`);

  console.log(`\nVentas de esos pedidos: ${ventas.length}`);
  for (const [estado, cantidad] of [...porEstadoVenta].sort()) console.log(`  ${estado}: ${cantidad}`);

  console.log("\nCuentas demo (contraseña: DATOS_DEMO_PASSWORD si la definiste; si no, la constante PASSWORD_DEMO de scripts/datos-demo.js):");
  for (const cuenta of CUENTAS_PERSONAL) {
    console.log(`  ${cuenta.correo}  rol ${cuenta.rol}${cuentasCreadas.includes(cuenta.correo) ? "" : " (ya existía)"}`);
  }
  for (const cliente of CLIENTES) {
    const zona = zonas.find((z) => normalizar(z.ciudad) === normalizar(cliente.zona.ciudad));
    console.log(`  ${correoCliente(cliente.n)}  rol cliente  (${zona?.ciudad ?? cliente.zona.ciudad})`);
  }

  console.log("\nContra entrega por zona:");
  for (const zona of zonas) {
    if (!ZONAS_DEMO.some((d) => normalizar(d.ciudad) === normalizar(zona.ciudad))) continue;
    console.log(`  ${zona.ciudad}: ${zona.permiteContraEntrega ? "habilitado" : "NO habilitado"}`);
  }

  console.log("\nVariantes en stock bajo o agotadas por los ajustes de la demo:");
  for (const ajuste of AJUSTES_STOCK) {
    const actual = stock.get(ajuste.sku);
    console.log(`  ${ajuste.sku}: ${actual === 0 ? "AGOTADA (0)" : `stock bajo (${actual})`}`);
  }

  console.log(`\nCliente 4 (Barranquilla): rechazo de contra entrega verificado; su carrito quedó con 1 producto (${SKU_CARRITO_CLIENTE_4}).`);

  const total = registros.reduce((suma, r) => suma + r.totalEsperado, 0);
  console.log(`Importe total de los pedidos (con envío): ${pesos(total)}`);

  console.log(
    `\nConsistencia: ${comprobacion.comprobaciones - comprobacion.fallas.length}/${comprobacion.comprobaciones} comprobaciones correctas.`,
  );
  for (const falla of comprobacion.fallas) console.log(`  FALLA: ${falla}`);
}

// ---------------------------------------------------------------------------
// Programa principal
// ---------------------------------------------------------------------------

let hayDatosParciales = false;

async function main() {
  const argumentos = leerArgumentos();

  if (argumentos.ayuda) {
    console.log(AYUDA);
    return;
  }

  validarPasswordDemo();

  // Guardas de seguridad, antes de cualquier petición o consulta.
  const base = resolverApi();
  exigirBaseLocal();

  const api = crearApi(base);
  const prisma = cargarDelBackend("./src/config/prisma");
  const hashes = { ...cargarDelBackend("./src/utils/hash") };
  const ahora = new Date();

  try {
    await comprobarBackend(api);
    const entorno = await comprobarEntorno(prisma, hashes, ahora);

    if (argumentos.verificar) {
      console.log("Comprobaciones previas correctas: la demo se puede cargar. No se creó nada.");
      return;
    }

    console.log("Cargando datos de demostración (no se borra nada)...");
    hayDatosParciales = true;

    const cuentasCreadas = await crearPersonal(prisma, hashes, entorno.rolPorNombre);
    paso(`Cuentas de personal: ${cuentasCreadas.length} creada(s)`);

    const sesiones = {};
    for (const cuenta of CUENTAS_PERSONAL) {
      sesiones[cuenta.clave] = await iniciarSesion(api, cuenta.correo, `iniciar sesión ${cuenta.clave}`);
    }

    const clientes = await registrarClientes(api, entorno.zonas);
    paso(`Clientes registrados con su dirección principal: ${clientes.size}`);

    const cambiosZonas = await configurarZonas(api, sesiones.admin, entorno.zonas);
    paso(`Zonas: ${cambiosZonas.length > 0 ? cambiosZonas.join("; ") : "ya estaban configuradas"}`);

    const movimientos = await ajustarInventario(api, sesiones.admin, entorno.variantes, ahora);
    paso(`Movimientos de inventario: ${movimientos.length}`);

    const registros = [];
    for (const [indice, plan] of PEDIDOS.entries()) {
      registros.push(await crearPedido(api, plan, indice, clientes, sesiones, entorno.variantes, ahora));
    }
    paso(`Pedidos creados por la API: ${registros.length}`);

    await verificarRechazoBarranquilla(api, clientes.get(4), entorno.variantes);
    paso("Rechazo de contra entrega en Barranquilla verificado");

    await retrasarFechas(prisma, registros, movimientos, ahora, cuentasCreadas);
    paso("Fechas repartidas en los últimos ~14 días (escritas directo en la base)");

    const comprobacion = await comprobarConsistencia(prisma, registros, sesiones, ahora);
    await imprimirResumen(api, prisma, sesiones.admin, registros, comprobacion, cuentasCreadas);

    hayDatosParciales = false;
    if (comprobacion.fallas.length > 0) {
      throw new ErrorDeUso("La carga terminó, pero fallaron comprobaciones de consistencia (ver arriba).");
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Todo lo que no se puede mostrar: contraseñas (la de la demo y la constante), tokens y la
// URL de la base con su contraseña.
function enmascarar(texto) {
  const url = process.env.DATABASE_URL;
  return sinSecretos(texto, [
    PASSWORD_DEMO,
    passwordDemo,
    process.env.DATOS_DEMO_PASSWORD,
    ...secretosDinamicos,
    url,
    ...(url ? passwordsDeLaUrl(url) : []),
  ]);
}

const AVISO_DATOS_PARCIALES =
  "ATENCIÓN, DATOS PARCIALES: la carga se interrumpió a mitad de camino y ya se habían creado datos en la base. " +
  "El script no borra nada ni puede reanudarse: al volver a correrlo va a decir «carga incompleta». " +
  "Usá una base nueva (por ejemplo, restaurá un respaldo anterior a la carga) o limpiá a mano los datos demo " +
  "(cuentas @trendy.test, sus pedidos y los movimientos de inventario de la demo).";

function avisarSiHayDatosParciales() {
  if (hayDatosParciales) console.error(AVISO_DATOS_PARCIALES);
}

function manejarErrorFinal(error) {
  const mensaje =
    error instanceof ErrorDeUso || error instanceof ErrorDeApi ? error.message : resumirError(error);
  fallar(enmascarar(mensaje));
  avisarSiHayDatosParciales();
}

if (require.main === module) {
  // Ctrl+C o un error que nadie atrapó: si ya se creó algo, se avisa (sin secretos).
  process.on("SIGINT", () => {
    console.error("\nInterrumpido (Ctrl+C).");
    avisarSiHayDatosParciales();
    process.exit(130);
  });
  process.on("uncaughtException", (error) => {
    manejarErrorFinal(error);
    process.exit(1);
  });
  process.on("unhandledRejection", (motivo) => {
    manejarErrorFinal(motivo);
    process.exit(1);
  });

  main().catch(manejarErrorFinal);
}

// Para las pruebas en seco de los planes de tiempos (sin tocar base ni red).
module.exports = { PEDIDOS, comprobarPlanDeTiempos, calcularTiempos, instantesDeHoy };
