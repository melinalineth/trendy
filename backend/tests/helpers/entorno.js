// Utilidades compartidas por los tests HTTP (carrito / envío).
//
// Requieren una base MySQL con las migraciones aplicadas y el seed corrido
// (los roles "cliente" y "vendedor" salen del seed). La conexión sale de
// DATABASE_URL: usá una base descartable, NO la de desarrollo. Cada test crea
// sus propios usuarios, catálogo, zonas y direcciones con nombres únicos y los
// borra al terminar (ver `limpiar`).
require("dotenv").config({ quiet: true });
process.env.JWT_SECRET ||= "secreto-solo-para-tests";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Los tests HTTP requieren DATABASE_URL (base migrada + seed, preferentemente descartable)"
  );
}

// Guarda: estos tests escriben en la base. Si el nombre no indica que es
// descartable (test / scratch) abortamos antes de tocar nada, así un `npm test`
// con el .env de desarrollo (base `trendy`) no ensucia datos reales.
const nombreBase = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "");
if (!/(test|scratch)/i.test(nombreBase)) {
  throw new Error(
    `Los tests HTTP se niegan a correr contra la base "${nombreBase}": usá una ` +
      `base descartable cuyo nombre contenga "test" o "scratch" (ej. trendy_test) ` +
      `exportando DATABASE_URL.`
  );
}

const { once } = require("node:events");
const prisma = require("../../src/config/prisma");
const app = require("../../src/app");
const { generarToken } = require("../../src/utils/jwt");

// Todo lo que se crea queda registrado acá para poder borrarlo en `limpiar`.
const creado = {
  usuarios: [],
  direcciones: [],
  zonas: [],
  categorias: [],
  productos: [],
  variantes: [],
  pedidos: [],
};

function sufijo() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Levanta el app en un puerto libre (nunca el 3000).
async function iniciarServidor() {
  const server = app.listen(0);
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    baseUrl,
    async cerrar() {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
}

// Cliente HTTP mínimo: devuelve { status, body } con el JSON ya parseado.
// `headers` permite sumar cabeceras propias (p. ej. x-signature del webhook de
// Mercado Pago).
async function pedir(baseUrl, metodo, ruta, { token, body, headers: extra } = {}) {
  const headers = { ...extra };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  const respuesta = await fetch(baseUrl + ruta, {
    method: metodo,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const texto = await respuesta.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = texto;
  }

  return { status: respuesta.status, body: json };
}

// Crea un usuario real (el carrito tiene FK a Usuario) y su JWT.
async function crearUsuario(nombreRol = "cliente") {
  const rol = await prisma.rol.findUnique({ where: { nombre: nombreRol } });
  if (!rol) {
    throw new Error(`Falta el rol "${nombreRol}": corré el seed (npx prisma db seed)`);
  }

  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Test ${nombreRol}`,
      correo: `test-${sufijo()}@trendy.test`,
      passwordHash: "no-se-usa-en-estos-tests",
      rolId: rol.id,
    },
  });
  creado.usuarios.push(usuario.id);

  return { id: usuario.id, token: generarToken({ ...usuario, rol }) };
}

// Crea categoría + producto + variante propios, con precio y stock controlados.
async function crearVariante({ precio = "19990.50", stock = 5, estado = "ACTIVO" } = {}) {
  const suf = sufijo();

  const categoria = await prisma.categoria.create({ data: { nombre: `Test-${suf}` } });
  creado.categorias.push(categoria.id);

  const producto = await prisma.producto.create({
    data: {
      nombre: `Producto test ${suf}`,
      descripcion: "Producto creado por los tests HTTP",
      precio,
      categoriaId: categoria.id,
      estado,
    },
  });
  creado.productos.push(producto.id);

  const variante = await prisma.variante.create({
    data: { productoId: producto.id, sku: `TEST-${suf}`, talla: "M", color: "Rojo", stock },
  });
  creado.variantes.push(variante.id);

  return variante;
}

// Zona de cobertura con ciudad/departamento únicos (hay unique por ambos).
async function crearZona({
  costo = "12000.00",
  estadoZona = "ACTIVO",
  estadoTarifa = "ACTIVO",
  permiteContraEntrega = false,
} = {}) {
  const suf = sufijo();

  const zona = await prisma.zonaCobertura.create({
    data: {
      nombre: `Zona test ${suf}`,
      departamento: `Depto-${suf}`,
      ciudad: `Ciudad-${suf}`,
      estado: estadoZona,
      permiteContraEntrega,
      tarifas: { create: { costo, estado: estadoTarifa } },
    },
  });
  creado.zonas.push(zona.id);

  return zona;
}

// Registra una zona creada por fuera de `crearZona` (ej. vía la API admin de
// zonas) para que `limpiar` la borre junto con sus tarifas.
function registrarZona(id) {
  creado.zonas.push(id);
}

// Dirección del usuario; por defecto en una ciudad SIN zona de cobertura.
async function crearDireccion(usuarioId, { ciudad, departamento } = {}) {
  const suf = sufijo();

  const direccion = await prisma.direccion.create({
    data: {
      usuarioId,
      destinatario: "Destinatario Test",
      telefono: "3000000000",
      calle: "Calle 1 # 2-3",
      ciudad: ciudad ?? `SinCobertura-${suf}`,
      departamento: departamento ?? `SinDepto-${suf}`,
    },
  });
  creado.direcciones.push(direccion.id);

  return direccion;
}

// Pedido creado DIRECTO con prisma, para preparar estados que el flujo HTTP
// (POST /api/v1/pedidos) no produce solo (legados, fechas viejas, etc.).
// `lineas` es [{ variante, cantidad, precioUnitario? }]; subtotal y total se
// calculan acá (total = subtotal + costoEnvio). No toca el stock: cada test
// decide si simula el descuento previo.
//   - creadoEn (opcional): fecha de creación (pedidos vencidos, filtros).
//   - estadoEnvio (opcional): si viene, crea también el InfoEnvio del pedido
//     con ese estado (el alta real lo crea en EN_PREPARACION).
async function crearPedido({
  usuarioId,
  direccionId,
  lineas,
  costoEnvio = 0,
  metodoPago = "MERCADO_PAGO",
  estado = "PENDIENTE",
  creadoEn,
  estadoEnvio,
}) {
  const detalles = lineas.map(({ variante, cantidad, precioUnitario = "10000.00" }) => ({
    varianteId: variante.id,
    cantidad,
    precioUnitario,
  }));
  const subtotal = detalles.reduce(
    (suma, d) => suma + Number(d.precioUnitario) * d.cantidad,
    0
  );

  const pedido = await prisma.pedido.create({
    data: {
      numero: `TEST-${sufijo()}`,
      usuarioId,
      direccionId,
      subtotal: subtotal.toFixed(2),
      costoEnvio: Number(costoEnvio).toFixed(2),
      total: (subtotal + Number(costoEnvio)).toFixed(2),
      metodoPago,
      estado,
      ...(creadoEn ? { creadoEn } : {}),
      detalles: { create: detalles },
      ...(estadoEnvio
        ? {
            infoEnvio: {
              create: {
                direccionId,
                costoEnvio: Number(costoEnvio).toFixed(2),
                estadoEnvio,
              },
            },
          }
        : {}),
    },
    include: { detalles: true, infoEnvio: true },
  });
  creado.pedidos.push(pedido.id);

  return pedido;
}

// Agrega una línea al carrito del usuario directo con prisma (crea el carrito
// si no existe). Para tests de pedidos: el carrito se prueba en su propio
// archivo.
async function agregarAlCarrito(usuarioId, variante, cantidad) {
  const carrito = await prisma.carrito.upsert({
    where: { usuarioId },
    create: { usuarioId },
    update: {},
  });

  return prisma.itemCarrito.upsert({
    where: { carritoId_varianteId: { carritoId: carrito.id, varianteId: variante.id } },
    create: { carritoId: carrito.id, varianteId: variante.id, cantidad },
    update: { cantidad },
  });
}

// Líneas actuales del carrito del usuario ([] si no tiene carrito).
async function itemsDelCarrito(usuarioId) {
  return prisma.itemCarrito.findMany({
    where: { carrito: { usuarioId } },
    orderBy: { varianteId: "asc" },
  });
}

// Borra todo lo creado, respetando el orden de las FKs, y cierra Prisma.
async function limpiar() {
  const { usuarios, direcciones, zonas, categorias, productos, variantes, pedidos } = creado;

  // Pedidos (y lo que cuelga de ellos) antes que usuarios, direcciones y
  // variantes, que son FKs del pedido y de sus detalles.
  const filtroPedidos = {
    OR: [{ id: { in: pedidos } }, { usuarioId: { in: usuarios } }],
  };
  await prisma.pago.deleteMany({ where: { pedido: filtroPedidos } });
  await prisma.infoEnvio.deleteMany({ where: { pedido: filtroPedidos } });
  await prisma.detallePedido.deleteMany({ where: { pedido: filtroPedidos } });
  await prisma.pedido.deleteMany({ where: filtroPedidos });

  // Los movimientos de inventario tienen FK a variante y usuario: van primero.
  await prisma.inventarioMovimiento.deleteMany({
    where: {
      OR: [{ varianteId: { in: variantes } }, { usuarioId: { in: usuarios } }],
    },
  });
  await prisma.itemCarrito.deleteMany({
    where: {
      OR: [
        { carrito: { usuarioId: { in: usuarios } } },
        { varianteId: { in: variantes } },
      ],
    },
  });
  await prisma.carrito.deleteMany({ where: { usuarioId: { in: usuarios } } });
  await prisma.direccion.deleteMany({
    where: { OR: [{ id: { in: direcciones } }, { usuarioId: { in: usuarios } }] },
  });
  await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
  await prisma.tarifaEnvio.deleteMany({ where: { zonaCoberturaId: { in: zonas } } });
  await prisma.zonaCobertura.deleteMany({ where: { id: { in: zonas } } });
  await prisma.variante.deleteMany({ where: { id: { in: variantes } } });
  await prisma.producto.deleteMany({ where: { id: { in: productos } } });
  await prisma.categoria.deleteMany({ where: { id: { in: categorias } } });

  await prisma.$disconnect();
}

module.exports = {
  prisma,
  iniciarServidor,
  pedir,
  crearUsuario,
  crearVariante,
  crearZona,
  registrarZona,
  crearDireccion,
  crearPedido,
  agregarAlCarrito,
  itemsDelCarrito,
  sufijo,
  limpiar,
};
