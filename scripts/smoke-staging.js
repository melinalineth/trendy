#!/usr/bin/env node
// Smoke test del staging de Trendy (docs/despliegue/staging.md).
//
// Recorre el stack levantado con Docker Compose por HTTP, igual que lo haría
// un usuario, y sale con código 0 si todo pasa o 1 con un resumen de lo que
// falló. Node 20+, sin dependencias (usa fetch).
//
// Uso:
//   node scripts/smoke-staging.js
//
// Variables de entorno:
//   SMOKE_ADMIN_PASSWORD     (OBLIGATORIA, sin default) contraseña del admin del
//                            seed; también se acepta SEED_ADMIN_PASSWORD
//   STAGING_URL              URL base del stack            (http://localhost:8080)
//   SMOKE_ADMIN_CORREO       correo del admin del seed (o SEED_ADMIN_CORREO;
//                            por defecto admin@trendy.test)
//   SMOKE_CONFIRMAR=1        obligatoria si STAGING_URL NO es localhost,
//                            127.0.0.1 o [::1]: el script CREA usuarios, zonas,
//                            pedidos y ventas
//   SMOKE_OMITIR_MERCADOPAGO true = no probar el 503 de Mercado Pago (úsalo si
//                            cargaste credenciales de prueba en el staging)
//
// Qué NO prueba: el pago real con Mercado Pago ni su webhook (sin una URL
// pública Mercado Pago no puede notificar). Solo verifica que, sin
// credenciales, crear la preferencia responde 503 como está documentado.
//
// Deja datos de prueba en la base (un cliente nuevo por corrida, su dirección,
// pedidos cancelados y una venta anulada): es el costo de probar de verdad. Al
// terminar (aunque falle) cancela los pedidos que creó y desactiva la zona de
// cobertura de la prueba.
const assert = require("node:assert/strict");

const BASE = (process.env.STAGING_URL || "http://localhost:8080").replace(/\/+$/, "");
const API = `${BASE}/api/v1`;
const ADMIN_CORREO = process.env.SMOKE_ADMIN_CORREO || process.env.SEED_ADMIN_CORREO || "admin@trendy.test";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;
const OMITIR_MP = process.env.SMOKE_OMITIR_MERCADOPAGO === "true";
const TIMEOUT_MS = 20000;

// Guardas antes de tocar nada: contraseña obligatoria y confirmación explícita
// si el destino no es la máquina local.
function validarConfiguracion() {
  if (!ADMIN_PASSWORD) {
    console.error(
      "ERROR: falta la contraseña del admin. Definí SMOKE_ADMIN_PASSWORD (o SEED_ADMIN_PASSWORD) con la " +
        "que pusiste en SEED_ADMIN_PASSWORD al levantar el stack. No hay valor por defecto."
    );
    process.exit(1);
  }

  const host = new URL(BASE).hostname;
  const esLocal = ["localhost", "127.0.0.1", "[::1]"].includes(host);
  if (!esLocal && process.env.SMOKE_CONFIRMAR !== "1") {
    console.error(
      `ERROR: STAGING_URL apunta a ${host}, que no es la máquina local. Este script CREA usuarios, zonas, ` +
        "pedidos y ventas de prueba en ese entorno. Si es lo que querés, repetí con SMOKE_CONFIRMAR=1."
    );
    process.exit(1);
  }
}

const sufijo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const COSTO_ENVIO = 9000;

// Lo que el script va creando, para que `limpiar` pueda deshacerlo aunque un
// chequeo falle a mitad de camino.
const creado = { adminToken: null, pedidoIds: [], zonaId: null };

// --- Mini runner -----------------------------------------------------------
const resultados = [];
class FlujoInterrumpido extends Error {}

// Ejecuta un chequeo: imprime OK/FALLO y lo registra. Devuelve lo que devuelva
// `fn`, o undefined si falló (los pasos que dependen de él se cortan con
// `requerir`).
async function paso(nombre, fn) {
  try {
    const valor = await fn();
    resultados.push({ nombre, ok: true });
    console.log(`  OK     ${nombre}`);
    return valor === undefined ? true : valor;
  } catch (error) {
    const detalle = error?.message ?? String(error);
    resultados.push({ nombre, ok: false, detalle });
    console.log(`  FALLO  ${nombre}\n         ${detalle.split("\n").join("\n         ")}`);
    return undefined;
  }
}

// Corta el flujo si un paso previo falló (no tiene sentido seguir sin él).
function requerir(valor, que) {
  if (valor === undefined) {
    throw new FlujoInterrumpido(`se interrumpe: depende de «${que}», que falló`);
  }
  return valor;
}

function seccion(titulo) {
  console.log(`\n${titulo}`);
}

// --- HTTP ------------------------------------------------------------------
async function http(metodo, ruta, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  const url = ruta.startsWith("http") ? ruta : API + ruta;
  let respuesta;
  try {
    respuesta = await fetch(url, {
      method: metodo,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`${metodo} ${url}: no se pudo conectar (${error.cause?.code ?? error.name}); ¿está levantado el stack?`);
  }

  const texto = await respuesta.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    // No es JSON (p. ej. el HTML del frontend): se usa `texto`.
  }

  return { status: respuesta.status, json, texto, tipo: respuesta.headers.get("content-type") ?? "" };
}

// Exige un status y devuelve el JSON; si no coincide, el mensaje muestra la
// respuesta real para poder diagnosticar.
function esperar(respuesta, status, que) {
  assert.equal(
    respuesta.status,
    status,
    `${que}: se esperaba HTTP ${status} y llegó ${respuesta.status} — ${respuesta.texto.slice(0, 300)}`
  );
  return respuesta.json;
}

// Busca la venta de un pedido en el listado del personal (más nuevas primero).
async function buscarVenta(tokenAdmin, pedidoId) {
  const json = esperar(await http("GET", "/ventas?limite=100", { token: tokenAdmin }), 200, "GET /ventas");
  assert.ok(Array.isArray(json?.ventas), "GET /ventas debe devolver { ventas: [] }");
  return json.ventas.find((venta) => venta.pedidoId === pedidoId);
}

async function stockDeVariante(productoId, varianteId) {
  const producto = esperar(await http("GET", `/productos/${productoId}`), 200, "GET /productos/:id");
  const variante = producto.variantes.find((v) => v.id === varianteId);
  assert.ok(variante, `la variante ${varianteId} no está en el detalle del producto`);
  return variante.stock;
}

// --- Chequeos --------------------------------------------------------------
async function infraestructura() {
  seccion("1. Infraestructura (nginx, API, frontend)");

  await paso("GET /api/v1/health responde 200 { estado: ok }", async () => {
    const json = esperar(await http("GET", "/health"), 200, "GET /health");
    assert.deepEqual(json, { estado: "ok" });
  });

  const indice = await paso("GET / sirve el HTML del frontend", async () => {
    const r = await http("GET", `${BASE}/`);
    esperar(r, 200, "GET /");
    assert.match(r.tipo, /text\/html/, "GET / no devolvió HTML");
    assert.match(r.texto, /id="root"/, "el HTML no tiene el contenedor #root de React");
    return r.texto;
  });

  await paso("GET /catalogo (ruta de la SPA) devuelve el mismo index.html", async () => {
    const r = await http("GET", `${BASE}/catalogo`);
    esperar(r, 200, "GET /catalogo");
    assert.match(r.tipo, /text\/html/, "GET /catalogo no devolvió HTML");
    if (indice !== undefined) assert.equal(r.texto, indice, "el fallback de la SPA no sirve el index");
  });
}

async function catalogo() {
  seccion("2. Catálogo público");

  await paso("GET /categorias lista las categorías del seed", async () => {
    const json = esperar(await http("GET", "/categorias"), 200, "GET /categorias");
    assert.ok(Array.isArray(json) && json.length > 0, "no hay categorías (¿corrió el seed?)");
  });

  return paso("GET /productos lista productos con variantes con stock", async () => {
    const productos = esperar(await http("GET", "/productos"), 200, "GET /productos");
    assert.ok(Array.isArray(productos) && productos.length > 0, "el catálogo está vacío (¿corrió el seed?)");

    for (const producto of productos) {
      const variante = producto.variantes.find((v) => v.stock >= 2);
      if (variante) {
        return { productoId: producto.id, varianteId: variante.id, precio: Number(producto.precio) };
      }
    }
    throw new Error("ningún producto tiene una variante con al menos 2 unidades de stock");
  });
}

async function flujoDeCompra(articulo) {
  seccion("3. Autenticación");

  const admin = await paso("login del admin del seed", async () => {
    const json = esperar(
      await http("POST", "/auth/login", { body: { correo: ADMIN_CORREO, password: ADMIN_PASSWORD } }),
      200,
      "POST /auth/login (admin)"
    );
    assert.ok(json.token, "el login no devolvió token");
    creado.adminToken = json.token;
    return { token: json.token, id: json.usuario.id };
  });

  // Sin el admin no se crea nada: ni siquiera el cliente de prueba.
  requerir(admin, "login del admin");

  const correo = `smoke-${sufijo}@trendy.test`;
  const password = `Smoke-${sufijo}-pw`;

  const registrado = await paso("registro de un cliente nuevo (correo único)", async () => {
    const json = esperar(
      await http("POST", "/auth/register", {
        body: { nombre: "Cliente Smoke", correo, password, aceptaPoliticas: true },
      }),
      201,
      "POST /auth/register"
    );
    assert.ok(json.id, "el registro no devolvió el id");
    assert.equal(json.passwordHash, undefined, "el registro filtra el hash de la contraseña");
    return json;
  });

  const cliente = await paso("login del cliente nuevo", async () => {
    requerir(registrado, "registro del cliente");
    const json = esperar(await http("POST", "/auth/login", { body: { correo, password } }), 200, "POST /auth/login");
    assert.ok(json.token, "el login no devolvió token");
    return { token: json.token, id: json.usuario.id };
  });

  await paso("un cliente no puede consultar ventas (403)", async () => {
    requerir(cliente, "login del cliente");
    esperar(await http("GET", "/ventas", { token: cliente.token }), 403, "GET /ventas como cliente");
  });

  requerir(cliente, "login del cliente");
  requerir(articulo, "catálogo con stock");

  // ---------------------------------------------------------------- Envío
  seccion("4. Zona de cobertura y dirección");

  const zona = await paso("el admin crea una zona de cobertura con tarifa", async () => {
    const json = esperar(
      await http("POST", "/zonas-cobertura", {
        token: admin.token,
        body: {
          nombre: `Zona smoke ${sufijo}`,
          departamento: `Depto smoke ${sufijo}`,
          ciudad: `Ciudad smoke ${sufijo}`,
          tarifa: { costo: COSTO_ENVIO },
        },
      }),
      201,
      "POST /zonas-cobertura"
    );
    assert.ok(json.id, "la zona no trae id");
    creado.zonaId = json.id;
    return json;
  });
  requerir(zona, "creación de la zona");

  await paso("el admin habilita el pago contra entrega en la zona", async () => {
    const json = esperar(
      await http("PATCH", `/zonas-cobertura/${zona.id}/contra-entrega`, {
        token: admin.token,
        body: { permiteContraEntrega: true },
      }),
      200,
      "PATCH /zonas-cobertura/:id/contra-entrega"
    );
    assert.equal(json.permiteContraEntrega, true);
  });

  const direccion = await paso("el cliente crea una dirección dentro de la zona", async () => {
    const json = esperar(
      await http("POST", "/direcciones", {
        token: cliente.token,
        body: {
          destinatario: "Cliente Smoke",
          telefono: "3000000000",
          calle: "Calle 1 # 2-3",
          ciudad: zona.ciudad,
          departamento: zona.departamento,
        },
      }),
      201,
      "POST /direcciones"
    );
    assert.ok(json.id, "la dirección no trae id");
    return json;
  });
  requerir(direccion, "creación de la dirección");

  // ----------------------------------------------------- Compra contra entrega
  seccion("5. Compra con pago contra entrega");

  const stockAntes = await paso("lee el stock de la variante antes de comprar", () =>
    stockDeVariante(articulo.productoId, articulo.varianteId)
  );
  requerir(stockAntes, "lectura de stock");

  await paso("agrega la variante al carrito", async () => {
    esperar(
      await http("POST", "/carrito/items", {
        token: cliente.token,
        body: { varianteId: articulo.varianteId, cantidad: 1 },
      }),
      201,
      "POST /carrito/items"
    );
  });

  const resumen = await paso("el resumen del carrito suma subtotal y envío de la zona", async () => {
    const json = esperar(
      await http("GET", `/carrito/resumen?direccionId=${direccion.id}`, { token: cliente.token }),
      200,
      "GET /carrito/resumen"
    );
    assert.equal(json.subtotal, articulo.precio, "subtotal distinto del precio del producto");
    assert.equal(json.costoEnvio, COSTO_ENVIO, "el costo de envío no es el de la zona");
    assert.equal(json.total, articulo.precio + COSTO_ENVIO, "total distinto de subtotal + envío");
    return json;
  });
  requerir(resumen, "resumen del carrito");

  const pedido = await paso("crea el pedido CONTRA_ENTREGA", async () => {
    const json = esperar(
      await http("POST", "/pedidos", {
        token: cliente.token,
        body: { direccionId: direccion.id, metodoPago: "CONTRA_ENTREGA" },
      }),
      201,
      "POST /pedidos"
    );
    const p = json.pedido;
    assert.ok(p?.id, "la respuesta no trae el pedido");
    creado.pedidoIds.push(p.id);
    assert.equal(p.estado, "PENDIENTE");
    assert.equal(p.metodoPago, "CONTRA_ENTREGA");
    assert.equal(p.subtotal, resumen.subtotal);
    assert.equal(p.costoEnvio, resumen.costoEnvio);
    assert.equal(p.total, resumen.total);
    return p;
  });
  requerir(pedido, "creación del pedido");

  await paso("el stock de la variante bajó en 1 (reserva)", async () => {
    assert.equal(await stockDeVariante(articulo.productoId, articulo.varianteId), stockAntes - 1);
  });

  await paso("registra el pago contra entrega (queda PENDIENTE)", async () => {
    const json = esperar(
      await http("POST", "/pagos/contra-entrega", { token: cliente.token, body: { pedidoId: pedido.id } }),
      201,
      "POST /pagos/contra-entrega"
    );
    assert.equal(json.metodo, "CONTRA_ENTREGA");
    assert.equal(json.estado, "PENDIENTE");
    assert.equal(json.monto, pedido.total);
  });

  await paso("el cliente consulta su pedido y el estado del pago", async () => {
    const detalle = esperar(await http("GET", `/pedidos/${pedido.id}`, { token: cliente.token }), 200, "GET /pedidos/:id");
    assert.equal(detalle.id, pedido.id);
    assert.equal(detalle.estado, "PENDIENTE");
    const pago = esperar(await http("GET", `/pedidos/${pedido.id}/pago`, { token: cliente.token }), 200, "GET /pedidos/:id/pago");
    assert.equal(pago.estado, "PENDIENTE");
  });

  // -------------------------------------------------------------- Ventas
  seccion("6. Venta: nace al confirmar el pedido y se anula al cancelarlo");

  await paso("antes de confirmar, el pedido todavía no tiene venta", async () => {
    assert.equal(await buscarVenta(admin.token, pedido.id), undefined, "ya existe una venta del pedido sin confirmar");
  });

  await paso("el admin confirma el pedido (PENDIENTE -> CONFIRMADO)", async () => {
    const json = esperar(
      await http("PATCH", `/pedidos/${pedido.id}/estado`, { token: admin.token, body: { estado: "CONFIRMADO" } }),
      200,
      "PATCH /pedidos/:id/estado"
    );
    assert.equal(json.pedido.estado, "CONFIRMADO");
  });

  await paso("aparece la venta REGISTRADA con los montos del pedido", async () => {
    const venta = await buscarVenta(admin.token, pedido.id);
    assert.ok(venta, "no apareció la venta del pedido confirmado");
    assert.equal(venta.estado, "REGISTRADA");
    assert.equal(venta.anuladaEn, null);
    assert.equal(venta.metodoPago, "CONTRA_ENTREGA");
    assert.equal(venta.subtotal, pedido.subtotal);
    assert.equal(venta.costoEnvio, pedido.costoEnvio);
    assert.equal(venta.total, pedido.total);
    assert.equal(venta.cliente.id, cliente.id);
    assert.equal(venta.responsable?.id, admin.id, "el responsable debería ser el admin que confirmó");
    assert.equal(venta.productos.length, 1);
    assert.equal(venta.productos[0].cantidad, 1);
    // `anuladaPor` todavía no lo expone la API (pendiente en
    // docs/diseno/pedidos-estados.md §9): si algún día aparece, debe ser null.
    if ("anuladaPor" in venta) assert.equal(venta.anuladaPor, null);
  });

  await paso("el seguimiento del cliente refleja el pedido confirmado", async () => {
    const json = esperar(
      await http("GET", `/pedidos/${pedido.id}/seguimiento`, { token: cliente.token }),
      200,
      "GET /pedidos/:id/seguimiento"
    );
    assert.equal(json.estadoPedido, "CONFIRMADO");
    assert.ok(Array.isArray(json.historial) && json.historial.length >= 1, "el historial de envío está vacío");
  });

  await paso("el admin cancela el pedido contra entrega confirmado", async () => {
    const json = esperar(
      await http("PATCH", `/pedidos/${pedido.id}/cancelar`, { token: admin.token }),
      200,
      "PATCH /pedidos/:id/cancelar"
    );
    assert.equal(json.pedido.estado, "CANCELADO");
    assert.equal(json.yaCancelado, false);
  });

  await paso("la venta pasa a ANULADA y conserva los montos", async () => {
    const venta = await buscarVenta(admin.token, pedido.id);
    assert.ok(venta, "la venta desapareció (una venta nunca se borra)");
    assert.equal(venta.estado, "ANULADA");
    assert.notEqual(venta.anuladaEn, null, "falta anuladaEn");
    assert.equal(venta.total, pedido.total);
    assert.equal(venta.responsable?.id, admin.id, "responsable (quien la registró) no debe cambiar");
    if ("anuladaPor" in venta) assert.equal(venta.anuladaPor?.id, admin.id);
  });

  await paso("la cancelación repuso el stock de la variante", async () => {
    assert.equal(await stockDeVariante(articulo.productoId, articulo.varianteId), stockAntes);
  });

  // ---------------------------------------------------------- Mercado Pago
  seccion("7. Mercado Pago sin credenciales");

  if (OMITIR_MP) {
    console.log("  (omitido por SMOKE_OMITIR_MERCADOPAGO=true)");
  } else {
    const pedidoMp = await paso("crea un pedido MERCADO_PAGO", async () => {
      esperar(
        await http("POST", "/carrito/items", {
          token: cliente.token,
          body: { varianteId: articulo.varianteId, cantidad: 1 },
        }),
        201,
        "POST /carrito/items"
      );
      const json = esperar(
        await http("POST", "/pedidos", {
          token: cliente.token,
          body: { direccionId: direccion.id, metodoPago: "MERCADO_PAGO" },
        }),
        201,
        "POST /pedidos (Mercado Pago)"
      );
      creado.pedidoIds.push(json.pedido.id);
      return json.pedido;
    });

    if (pedidoMp) {
      await paso("crear la preferencia sin credenciales responde 503 documentado", async () => {
        const r = await http("POST", "/pagos/mercadopago/preferencia", {
          token: cliente.token,
          body: { pedidoId: pedidoMp.id },
        });
        esperar(r, 503, "POST /pagos/mercadopago/preferencia");
        assert.equal(r.json?.error?.codigo, "CONFIGURACION_PAGOS_INCOMPLETA");
      });

      await paso("el admin cancela el pedido de Mercado Pago y se repone el stock", async () => {
        const json = esperar(
          await http("PATCH", `/pedidos/${pedidoMp.id}/cancelar`, { token: admin.token }),
          200,
          "PATCH /pedidos/:id/cancelar"
        );
        assert.equal(json.pedido.estado, "CANCELADO");
        assert.equal(await stockDeVariante(articulo.productoId, articulo.varianteId), stockAntes);
      });
    }
  }

}

// Deshace lo creado, pase lo que pase (se llama desde un `finally`). Es
// best-effort: nunca lanza, no cuenta como chequeo y no cambia el código de
// salida; si algo no se puede deshacer, avisa y sigue. Cancelar un pedido ya
// cancelado es idempotente (200 yaCancelado), así que se reintenta sin riesgo.
async function limpiar() {
  if (!creado.adminToken || (creado.pedidoIds.length === 0 && creado.zonaId === null)) return;

  seccion("Limpieza (se ejecuta siempre)");

  for (const id of creado.pedidoIds) {
    try {
      const r = await http("PATCH", `/pedidos/${id}/cancelar`, { token: creado.adminToken });
      console.log(r.status === 200 ? `  OK     pedido ${id} cancelado (stock repuesto)` : `  AVISO  no se pudo cancelar el pedido ${id}: HTTP ${r.status}`);
    } catch (error) {
      console.log(`  AVISO  no se pudo cancelar el pedido ${id}: ${error.message}`);
    }
  }

  if (creado.zonaId !== null) {
    try {
      const r = await http("PATCH", `/zonas-cobertura/${creado.zonaId}/estado`, {
        token: creado.adminToken,
        body: { estado: "INACTIVO" },
      });
      console.log(r.status === 200 ? `  OK     zona ${creado.zonaId} desactivada` : `  AVISO  no se pudo desactivar la zona ${creado.zonaId}: HTTP ${r.status}`);
    } catch (error) {
      console.log(`  AVISO  no se pudo desactivar la zona ${creado.zonaId}: ${error.message}`);
    }
  }
}

// --- Main ------------------------------------------------------------------
async function main() {
  validarConfiguracion();
  console.log(`Smoke test de Trendy contra ${BASE}`);

  try {
    await infraestructura();
    const articulo = await catalogo();

    try {
      await flujoDeCompra(articulo);
    } catch (error) {
      if (!(error instanceof FlujoInterrumpido)) throw error;
      console.log(`\n  ${error.message}`);
      resultados.push({ nombre: "flujo de compra", ok: false, detalle: error.message });
    }
  } finally {
    // Un error inesperado se propaga igual después de limpiar: la limpieza no
    // lo enmascara.
    await limpiar();
  }

  const fallos = resultados.filter((r) => !r.ok);
  console.log(`\nResumen: ${resultados.length - fallos.length}/${resultados.length} chequeos OK`);

  if (fallos.length > 0) {
    console.log("\nFALLARON:");
    for (const fallo of fallos) console.log(`  - ${fallo.nombre}\n      ${fallo.detalle.split("\n")[0]}`);
    process.exit(1);
  }

  console.log("Todo OK.");
}

main().catch((error) => {
  console.error(`\nERROR inesperado: ${error?.cause?.code ?? error?.message ?? error}`);
  process.exit(1);
});
