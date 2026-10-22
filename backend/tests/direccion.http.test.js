// Tests HTTP de las direcciones de entrega (RF-005, RN-003).
//
// Endpoints:
//   GET    /api/v1/direcciones       lista las propias
//   POST   /api/v1/direcciones       alta
//   PUT    /api/v1/direcciones/:id   modificación (reemplaza los datos)
//   DELETE /api/v1/direcciones/:id   baja
//
// Criterio central de RF-005: "la dirección utilizada quedará registrada en el
// pedido como una copia histórica". Pedido e InfoEnvio apuntan a la fila de
// Direccion (FK, sin copia de campos), así que editar o borrar en el lugar
// cambiaría o rompería pedidos ya hechos. Por eso: una dirección con pedidos
// no se modifica ni se borra de verdad (se versiona / se da de baja lógica) y
// una sin pedidos sí se edita y se borra en el lugar. Ver direccion.service.js.
const { describe, it, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");

const {
  prisma,
  iniciarServidor,
  pedir,
  crearUsuario,
  crearVariante,
  crearZona,
  crearDireccion,
  crearPedido,
  agregarAlCarrito,
  itemsDelCarrito,
  sufijo,
  limpiar,
} = require("./helpers/entorno");
const envioService = require("../src/services/envio.service");
const pedidoService = require("../src/services/pedido.service");

function assertErrorEstandar(respuesta, status, codigo) {
  assert.equal(respuesta.status, status, JSON.stringify(respuesta.body));
  assert.deepEqual(Object.keys(respuesta.body.error).sort(), ["codigo", "detalles", "mensaje"]);
  assert.equal(respuesta.body.error.codigo, codigo);
}

const DATOS = Object.freeze({
  destinatario: "Ana Gómez",
  telefono: "3001234567",
  calle: "Carrera 7 # 12-34",
  ciudad: "Bogotá",
  departamento: "Cundinamarca",
  codigoPostal: "110111",
  referencia: "Torre 2, apto 301",
});

describe("Direcciones de entrega (RF-005)", () => {
  let servidor;
  let api;

  before(async () => {
    servidor = await iniciarServidor();
    api = (metodo, ruta, opciones) => pedir(servidor.baseUrl, metodo, ruta, opciones);
  });

  after(async () => {
    await servidor.cerrar();
    // Direcciones creadas por la API (no pasan por `crearDireccion`): se borran
    // por usuario en `limpiar`.
    await limpiar();
  });

  async function crear(usuario, datos = {}) {
    const respuesta = await api("POST", "/api/v1/direcciones", {
      token: usuario.token,
      body: { ...DATOS, ...datos },
    });
    assert.equal(respuesta.status, 201, JSON.stringify(respuesta.body));
    return respuesta.body;
  }

  const listar = (usuario) => api("GET", "/api/v1/direcciones", { token: usuario.token });
  const editar = (usuario, id, body) =>
    api("PUT", `/api/v1/direcciones/${id}`, { token: usuario.token, body });
  const marcarPrincipal = (usuario, id, body) =>
    api("PATCH", `/api/v1/direcciones/${id}`, { token: usuario.token, body });
  const borrar = (usuario, id) =>
    api("DELETE", `/api/v1/direcciones/${id}`, { token: usuario.token });

  // Cliente con una zona de cobertura y una dirección en ella (para pedidos).
  async function clienteConZona() {
    const cliente = await crearUsuario("cliente");
    const zona = await crearZona({ costo: "12000.00", permiteContraEntrega: true });
    const direccion = await crear(cliente, {
      ciudad: zona.ciudad,
      departamento: zona.departamento,
    });
    return { cliente, zona, direccion };
  }

  async function pedidoDe(cliente, direccion) {
    const variante = await crearVariante({ stock: 10 });
    return crearPedido({
      usuarioId: cliente.id,
      direccionId: direccion.id,
      lineas: [{ variante, cantidad: 1 }],
      estadoEnvio: "EN_PREPARACION",
    });
  }

  describe("autenticación", () => {
    it("sin token -> 401 en listar, crear, editar, marcar principal y eliminar", async () => {
      assert.equal((await api("GET", "/api/v1/direcciones")).status, 401);
      assert.equal((await api("POST", "/api/v1/direcciones", { body: DATOS })).status, 401);
      assert.equal((await api("PUT", "/api/v1/direcciones/1", { body: DATOS })).status, 401);
      assert.equal((await api("DELETE", "/api/v1/direcciones/1")).status, 401);
      assert.equal(
        (await api("PATCH", "/api/v1/direcciones/1", { body: { esPrincipal: true } })).status,
        401
      );
    });

    it("token inválido -> 401 en editar y eliminar", async () => {
      assert.equal(
        (await api("PUT", "/api/v1/direcciones/1", { token: "basura", body: DATOS })).status,
        401
      );
      assert.equal((await api("DELETE", "/api/v1/direcciones/1", { token: "basura" })).status, 401);
    });
  });

  describe("alta y listado", () => {
    it("crea y lista solo las direcciones propias", async () => {
      const ana = await crearUsuario("cliente");
      const beto = await crearUsuario("cliente");
      const deAna = await crear(ana);
      await crear(beto, { destinatario: "Beto" });

      const respuesta = await listar(ana);

      assert.equal(respuesta.status, 200);
      assert.deepEqual(
        respuesta.body.map((d) => d.id),
        [deAna.id]
      );
    });

    it("datos inválidos -> 400 VALIDACION_FALLIDA con el formato estándar", async () => {
      const cliente = await crearUsuario("cliente");

      const respuesta = await api("POST", "/api/v1/direcciones", {
        token: cliente.token,
        body: { ...DATOS, calle: "" },
      });

      assertErrorEstandar(respuesta, 400, "VALIDACION_FALLIDA");
      assert.deepEqual(respuesta.body.error.detalles, ["La calle es requerida"]);
    });
  });

  describe("PUT /api/v1/direcciones/:id", () => {
    it("modifica todos los campos y el cambio persiste en el listado", async () => {
      const cliente = await crearUsuario("cliente");
      const original = await crear(cliente);

      const nuevos = {
        destinatario: "Luis Pérez",
        telefono: "3109998877",
        calle: "Calle 80 # 20-10",
        ciudad: "Medellín",
        departamento: "Antioquia",
        codigoPostal: "050001",
        referencia: "Portería",
      };
      const respuesta = await editar(cliente, original.id, nuevos);

      assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
      assert.partialDeepStrictEqual(respuesta.body, { id: original.id, ...nuevos });

      const lista = (await listar(cliente)).body;
      assert.equal(lista.length, 1);
      assert.partialDeepStrictEqual(lista[0], { id: original.id, ...nuevos });
    });

    it("reemplaza los datos: los opcionales omitidos quedan sin valor", async () => {
      const cliente = await crearUsuario("cliente");
      const original = await crear(cliente);

      const { codigoPostal, referencia, ...obligatorios } = DATOS;
      const respuesta = await editar(cliente, original.id, obligatorios);

      assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
      assert.equal(respuesta.body.codigoPostal, null);
      assert.equal(respuesta.body.referencia, null);
    });

    it("sin esPrincipal en el body conserva el valor que tenía", async () => {
      const cliente = await crearUsuario("cliente");
      const principal = await crear(cliente, { esPrincipal: true });

      const respuesta = await editar(cliente, principal.id, { ...DATOS, calle: "Otra calle 1" });

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.esPrincipal, true);
    });

    it("marcar una como principal desmarca la anterior (una sola principal)", async () => {
      const cliente = await crearUsuario("cliente");
      const primera = await crear(cliente, { esPrincipal: true });
      const segunda = await crear(cliente, { destinatario: "Segunda" });

      const respuesta = await editar(cliente, segunda.id, { ...DATOS, esPrincipal: true });

      assert.equal(respuesta.status, 200);
      const lista = (await listar(cliente)).body;
      const principales = lista.filter((d) => d.esPrincipal).map((d) => d.id);
      assert.deepEqual(principales, [segunda.id]);
      assert.equal(lista.find((d) => d.id === primera.id).esPrincipal, false);
    });

    it("esPrincipal:false sobre la principal la deja sin principal", async () => {
      const cliente = await crearUsuario("cliente");
      const principal = await crear(cliente, { esPrincipal: true });

      const respuesta = await editar(cliente, principal.id, { ...DATOS, esPrincipal: false });

      assert.equal(respuesta.status, 200);
      assert.equal((await listar(cliente)).body.filter((d) => d.esPrincipal).length, 0);
    });

    it("sin pedidos se edita en el lugar (mismo id)", async () => {
      const cliente = await crearUsuario("cliente");
      const original = await crear(cliente);

      const respuesta = await editar(cliente, original.id, { ...DATOS, calle: "Calle nueva 5" });

      assert.equal(respuesta.body.id, original.id);
      assert.equal(await prisma.direccion.count({ where: { usuarioId: cliente.id } }), 1);
    });

    it("body inválido -> 400 VALIDACION_FALLIDA y no modifica nada", async () => {
      const cliente = await crearUsuario("cliente");
      const original = await crear(cliente);

      const casos = [
        [{}, 5],
        [{ ...DATOS, destinatario: "   " }, 1],
        [{ ...DATOS, telefono: undefined }, 1],
        [{ ...DATOS, ciudad: "" }, 1],
        [{ ...DATOS, departamento: 123 }, 1],
      ];

      for (const [body, minimoDetalles] of casos) {
        const respuesta = await editar(cliente, original.id, body);
        assertErrorEstandar(respuesta, 400, "VALIDACION_FALLIDA");
        assert.ok(
          respuesta.body.error.detalles.length >= minimoDetalles,
          JSON.stringify(respuesta.body)
        );
      }

      const guardada = await prisma.direccion.findUnique({ where: { id: original.id } });
      assert.equal(guardada.calle, DATOS.calle);
    });

    it("id inválido -> 400 VALIDACION_FALLIDA", async () => {
      const cliente = await crearUsuario("cliente");

      for (const id of ["abc", "0", "-1", "1.5", "1e3"]) {
        const respuesta = await editar(cliente, id, DATOS);
        assertErrorEstandar(respuesta, 400, "VALIDACION_FALLIDA");
      }
    });

    it("dirección ajena o inexistente -> 404 idéntico, sin revelar que existe", async () => {
      const dueno = await crearUsuario("cliente");
      const intruso = await crearUsuario("cliente");
      const ajena = await crear(dueno);

      const sobreAjena = await editar(intruso, ajena.id, { ...DATOS, calle: "Hackeada" });
      const sobreInexistente = await editar(intruso, 2147483647, DATOS);

      assertErrorEstandar(sobreAjena, 404, "DIRECCION_NO_ENCONTRADA");
      assertErrorEstandar(sobreInexistente, 404, "DIRECCION_NO_ENCONTRADA");
      assert.deepEqual(sobreAjena.body, sobreInexistente.body);

      const intacta = await prisma.direccion.findUnique({ where: { id: ajena.id } });
      assert.equal(intacta.calle, DATOS.calle);
    });

    it("una dirección ya eliminada responde 404", async () => {
      const cliente = await crearUsuario("cliente");
      const direccion = await crear(cliente);
      assert.equal((await borrar(cliente, direccion.id)).status, 204);

      assertErrorEstandar(await editar(cliente, direccion.id, DATOS), 404, "DIRECCION_NO_ENCONTRADA");
    });

    it("cualquier rol autenticado edita SUS direcciones (vendedor)", async () => {
      const vendedor = await crearUsuario("vendedor");
      const propia = await crear(vendedor);

      const respuesta = await editar(vendedor, propia.id, { ...DATOS, calle: "Calle del vendedor" });

      assert.equal(respuesta.status, 200);
    });

    describe("dirección usada por un pedido (copia histórica)", () => {
      it("cambiar los datos de entrega NO altera el pedido: la dirección nueva es otra fila", async () => {
        const { cliente, direccion } = await clienteConZona();
        const pedido = await pedidoDe(cliente, direccion);

        const respuesta = await editar(cliente, direccion.id, {
          ...DATOS,
          ciudad: direccion.ciudad,
          departamento: direccion.departamento,
          destinatario: "Nuevo destinatario",
          calle: "Calle nueva 99",
        });

        assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
        assert.notEqual(respuesta.body.id, direccion.id);
        assert.equal(respuesta.body.calle, "Calle nueva 99");

        // El listado muestra solo la versión vigente.
        const lista = (await listar(cliente)).body;
        assert.deepEqual(
          lista.map((d) => d.id),
          [respuesta.body.id]
        );

        // El pedido conserva EXACTAMENTE lo que se usó al comprar.
        const detalle = await api("GET", `/api/v1/pedidos/${pedido.id}`, { token: cliente.token });
        assert.equal(detalle.status, 200);
        assert.equal(detalle.body.direccionId, direccion.id);
        assert.equal(detalle.body.direccion.destinatario, direccion.destinatario);
        assert.equal(detalle.body.direccion.calle, direccion.calle);
        assert.equal(detalle.body.infoEnvio.direccionId, direccion.id);

        const seguimiento = await api("GET", `/api/v1/pedidos/${pedido.id}/seguimiento`, {
          token: cliente.token,
        });
        assert.equal(seguimiento.status, 200);
        assert.equal(seguimiento.body.direccion.calle, direccion.calle);
      });

      it("la nueva versión hereda el flag de principal y la vieja lo pierde", async () => {
        const { cliente, direccion } = await clienteConZona();
        await editar(cliente, direccion.id, {
          ...DATOS,
          ciudad: direccion.ciudad,
          departamento: direccion.departamento,
          esPrincipal: true,
        });
        await pedidoDe(cliente, direccion);

        const respuesta = await editar(cliente, direccion.id, {
          ...DATOS,
          ciudad: direccion.ciudad,
          departamento: direccion.departamento,
          calle: "Otra calle 7",
        });

        assert.equal(respuesta.body.esPrincipal, true);
        const vieja = await prisma.direccion.findUnique({ where: { id: direccion.id } });
        assert.equal(vieja.esPrincipal, false);
        assert.equal((await listar(cliente)).body.filter((d) => d.esPrincipal).length, 1);
      });

      it("cambiar SOLO esPrincipal no versiona: sigue siendo la misma fila", async () => {
        const { cliente, direccion } = await clienteConZona();
        await pedidoDe(cliente, direccion);

        const respuesta = await editar(cliente, direccion.id, {
          destinatario: direccion.destinatario,
          telefono: direccion.telefono,
          calle: direccion.calle,
          ciudad: direccion.ciudad,
          departamento: direccion.departamento,
          codigoPostal: direccion.codigoPostal,
          referencia: direccion.referencia,
          esPrincipal: true,
        });

        assert.equal(respuesta.status, 200);
        assert.equal(respuesta.body.id, direccion.id);
        assert.equal(respuesta.body.esPrincipal, true);
        assert.equal(await prisma.direccion.count({ where: { usuarioId: cliente.id } }), 1);
      });
    });
  });

  describe("DELETE /api/v1/direcciones/:id", () => {
    it("elimina una dirección sin pedidos: 204 y desaparece de verdad", async () => {
      const cliente = await crearUsuario("cliente");
      const direccion = await crear(cliente);

      const respuesta = await borrar(cliente, direccion.id);

      assert.equal(respuesta.status, 204);
      assert.deepEqual((await listar(cliente)).body, []);
      assert.equal(await prisma.direccion.count({ where: { id: direccion.id } }), 0);
    });

    it("eliminar la misma dos veces -> 404 la segunda", async () => {
      const cliente = await crearUsuario("cliente");
      const direccion = await crear(cliente);

      assert.equal((await borrar(cliente, direccion.id)).status, 204);
      assertErrorEstandar(await borrar(cliente, direccion.id), 404, "DIRECCION_NO_ENCONTRADA");
    });

    it("dos bajas simultáneas: una 204 y la otra 404, nunca un 500", async () => {
      const cliente = await crearUsuario("cliente");
      const direccion = await crear(cliente);

      const [a, b] = await Promise.all([borrar(cliente, direccion.id), borrar(cliente, direccion.id)]);

      assert.deepEqual([a.status, b.status].sort(), [204, 404]);
    });

    it("id inválido -> 400 VALIDACION_FALLIDA", async () => {
      const cliente = await crearUsuario("cliente");

      for (const id of ["abc", "0", "-3", "2.5"]) {
        assertErrorEstandar(await borrar(cliente, id), 400, "VALIDACION_FALLIDA");
      }
    });

    it("dirección ajena o inexistente -> 404 idéntico y la ajena sigue existiendo", async () => {
      const dueno = await crearUsuario("cliente");
      const intruso = await crearUsuario("cliente");
      const ajena = await crear(dueno);

      const sobreAjena = await borrar(intruso, ajena.id);
      const sobreInexistente = await borrar(intruso, 2147483647);

      assertErrorEstandar(sobreAjena, 404, "DIRECCION_NO_ENCONTRADA");
      assertErrorEstandar(sobreInexistente, 404, "DIRECCION_NO_ENCONTRADA");
      assert.deepEqual(sobreAjena.body, sobreInexistente.body);
      assert.equal((await listar(dueno)).body.length, 1);
    });

    it("borrar una NO principal no toca la principal", async () => {
      const cliente = await crearUsuario("cliente");
      const principal = await crear(cliente, { esPrincipal: true });
      const otra = await crear(cliente, { destinatario: "Otra" });

      assert.equal((await borrar(cliente, otra.id)).status, 204);

      const lista = (await listar(cliente)).body;
      assert.deepEqual(
        lista.map((d) => [d.id, d.esPrincipal]),
        [[principal.id, true]]
      );
    });

    it("borrar la principal promueve la más reciente de las restantes", async () => {
      const cliente = await crearUsuario("cliente");
      const principal = await crear(cliente, { esPrincipal: true });
      await crear(cliente, { destinatario: "Vieja" });
      const reciente = await crear(cliente, { destinatario: "Reciente" });

      assert.equal((await borrar(cliente, principal.id)).status, 204);

      const lista = (await listar(cliente)).body;
      assert.equal(lista.length, 2);
      assert.deepEqual(
        lista.filter((d) => d.esPrincipal).map((d) => d.id),
        [reciente.id]
      );
    });

    it("borrar la única dirección deja la lista vacía", async () => {
      const cliente = await crearUsuario("cliente");
      const unica = await crear(cliente, { esPrincipal: true });

      assert.equal((await borrar(cliente, unica.id)).status, 204);

      assert.deepEqual((await listar(cliente)).body, []);
    });

    it("la promoción es solo entre las direcciones del mismo usuario", async () => {
      const cliente = await crearUsuario("cliente");
      const otro = await crearUsuario("cliente");
      const ajenaPrincipal = await crear(otro, { esPrincipal: true });
      const propia = await crear(cliente, { esPrincipal: true });

      assert.equal((await borrar(cliente, propia.id)).status, 204);

      const deOtro = (await listar(otro)).body;
      assert.deepEqual(
        deOtro.map((d) => [d.id, d.esPrincipal]),
        [[ajenaPrincipal.id, true]]
      );
    });

    describe("dirección usada por un pedido", () => {
      it("baja lógica: sale del listado pero el pedido conserva su dirección intacta", async () => {
        const { cliente, direccion } = await clienteConZona();
        const pedido = await pedidoDe(cliente, direccion);

        const respuesta = await borrar(cliente, direccion.id);

        assert.equal(respuesta.status, 204);
        assert.deepEqual((await listar(cliente)).body, []);

        // La fila sigue en la base (la necesitan Pedido e InfoEnvio), marcada.
        const fila = await prisma.direccion.findUnique({ where: { id: direccion.id } });
        assert.ok(fila.eliminadaEn instanceof Date);
        assert.equal(fila.esPrincipal, false);

        const detalle = await api("GET", `/api/v1/pedidos/${pedido.id}`, { token: cliente.token });
        assert.equal(detalle.status, 200);
        assert.equal(detalle.body.direccionId, direccion.id);
        assert.equal(detalle.body.direccion.destinatario, direccion.destinatario);
        assert.equal(detalle.body.direccion.calle, direccion.calle);
        assert.equal(detalle.body.direccion.ciudad, direccion.ciudad);
        assert.equal(detalle.body.infoEnvio.direccionId, direccion.id);

        const seguimiento = await api("GET", `/api/v1/pedidos/${pedido.id}/seguimiento`, {
          token: cliente.token,
        });
        assert.equal(seguimiento.status, 200);
        assert.equal(seguimiento.body.direccion.calle, direccion.calle);
      });

      it("el pedido también se ve igual para el personal (admin)", async () => {
        const { cliente, direccion } = await clienteConZona();
        const admin = await crearUsuario("admin");
        const pedido = await pedidoDe(cliente, direccion);
        await borrar(cliente, direccion.id);

        const detalle = await api("GET", `/api/v1/pedidos/${pedido.id}`, { token: admin.token });

        assert.equal(detalle.status, 200);
        assert.equal(detalle.body.direccion.calle, direccion.calle);
      });

      it("borrar la principal usada en un pedido también promueve otra", async () => {
        const { cliente, direccion } = await clienteConZona();
        await editar(cliente, direccion.id, {
          ...DATOS,
          ciudad: direccion.ciudad,
          departamento: direccion.departamento,
          esPrincipal: true,
        });
        await pedidoDe(cliente, direccion);
        const otra = await crear(cliente, { destinatario: "Otra" });

        assert.equal((await borrar(cliente, direccion.id)).status, 204);

        const lista = (await listar(cliente)).body;
        assert.deepEqual(
          lista.map((d) => [d.id, d.esPrincipal]),
          [[otra.id, true]]
        );
      });

      it("una versión anterior (de una edición) se puede eliminar sin romper el pedido", async () => {
        const { cliente, direccion } = await clienteConZona();
        const pedido = await pedidoDe(cliente, direccion);
        const nueva = (
          await editar(cliente, direccion.id, {
            ...DATOS,
            ciudad: direccion.ciudad,
            departamento: direccion.departamento,
            calle: "Calle v2",
          })
        ).body;

        // La versión vieja ya no es accesible por la API.
        assertErrorEstandar(await borrar(cliente, direccion.id), 404, "DIRECCION_NO_ENCONTRADA");
        // Y borrar la nueva (sin pedidos) la elimina de verdad.
        assert.equal((await borrar(cliente, nueva.id)).status, 204);
        assert.equal(await prisma.direccion.count({ where: { id: nueva.id } }), 0);

        const detalle = await api("GET", `/api/v1/pedidos/${pedido.id}`, { token: cliente.token });
        assert.equal(detalle.body.direccion.calle, direccion.calle);
      });
    });

    describe("checkout con una dirección eliminada", () => {
      it("crear el pedido con ella -> 404 DIRECCION_NO_ENCONTRADA y el carrito queda intacto", async () => {
        const { cliente, direccion } = await clienteConZona();
        const variante = await crearVariante({ stock: 5 });
        await agregarAlCarrito(cliente.id, variante, 2);
        assert.equal((await borrar(cliente, direccion.id)).status, 204);

        const respuesta = await api("POST", "/api/v1/pedidos", {
          token: cliente.token,
          body: { direccionId: direccion.id, metodoPago: "CONTRA_ENTREGA" },
        });

        assertErrorEstandar(respuesta, 404, "DIRECCION_NO_ENCONTRADA");
        assert.equal((await itemsDelCarrito(cliente.id)).length, 1);
        assert.equal(await prisma.pedido.count({ where: { usuarioId: cliente.id } }), 0);
      });

      it("lo mismo si la dirección tenía pedidos (baja lógica)", async () => {
        const { cliente, direccion } = await clienteConZona();
        await pedidoDe(cliente, direccion);
        const variante = await crearVariante({ stock: 5 });
        await agregarAlCarrito(cliente.id, variante, 1);
        assert.equal((await borrar(cliente, direccion.id)).status, 204);

        const respuesta = await api("POST", "/api/v1/pedidos", {
          token: cliente.token,
          body: { direccionId: direccion.id, metodoPago: "CONTRA_ENTREGA" },
        });

        assertErrorEstandar(respuesta, 404, "DIRECCION_NO_ENCONTRADA");
      });

      it("el costo de envío de una dirección eliminada responde 404", async () => {
        const { cliente, direccion } = await clienteConZona();
        assert.equal((await borrar(cliente, direccion.id)).status, 204);

        const respuesta = await api("GET", `/api/v1/envios/tarifa?direccionId=${direccion.id}`, {
          token: cliente.token,
        });

        assert.equal(respuesta.status, 404, JSON.stringify(respuesta.body));
      });

      it("después de editar una usada, comprar con la versión nueva funciona", async () => {
        const { cliente, zona, direccion } = await clienteConZona();
        await pedidoDe(cliente, direccion);
        const nueva = (
          await editar(cliente, direccion.id, {
            ...DATOS,
            ciudad: zona.ciudad,
            departamento: zona.departamento,
            calle: `Calle ${sufijo()}`,
          })
        ).body;
        const variante = await crearVariante({ stock: 5 });
        await agregarAlCarrito(cliente.id, variante, 1);

        const respuesta = await api("POST", "/api/v1/pedidos", {
          token: cliente.token,
          body: { direccionId: nueva.id, metodoPago: "CONTRA_ENTREGA" },
        });

        assert.equal(respuesta.status, 201, JSON.stringify(respuesta.body));
        assert.equal(respuesta.body.pedido.direccion.calle, nueva.calle);
      });
    });
  });

  describe("PATCH /api/v1/direcciones/:id (marcar como principal)", () => {
    it("marca como principal y desmarca la anterior, sin tocar los demás datos", async () => {
      const cliente = await crearUsuario("cliente");
      const primera = await crear(cliente, { esPrincipal: true });
      const segunda = await crear(cliente, { destinatario: "Segunda" });

      const respuesta = await marcarPrincipal(cliente, segunda.id, { esPrincipal: true });

      assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
      assert.partialDeepStrictEqual(respuesta.body, {
        id: segunda.id,
        destinatario: "Segunda",
        calle: DATOS.calle,
        esPrincipal: true,
      });
      const lista = (await listar(cliente)).body;
      assert.deepEqual(
        lista.filter((d) => d.esPrincipal).map((d) => d.id),
        [segunda.id]
      );
      assert.equal(lista.find((d) => d.id === primera.id).esPrincipal, false);
    });

    it("esPrincipal:false deja a la dirección sin principal", async () => {
      const cliente = await crearUsuario("cliente");
      const principal = await crear(cliente, { esPrincipal: true });

      const respuesta = await marcarPrincipal(cliente, principal.id, { esPrincipal: false });

      assert.equal(respuesta.status, 200);
      assert.equal((await listar(cliente)).body.filter((d) => d.esPrincipal).length, 0);
    });

    it("en una dirección con pedidos no crea una versión: misma fila, mismos datos", async () => {
      const { cliente, direccion } = await clienteConZona();
      await pedidoDe(cliente, direccion);

      const respuesta = await marcarPrincipal(cliente, direccion.id, { esPrincipal: true });

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.id, direccion.id);
      assert.equal(respuesta.body.calle, direccion.calle);
      assert.equal(await prisma.direccion.count({ where: { usuarioId: cliente.id } }), 1);
    });

    it("solo acepta esPrincipal booleano: cualquier otro cuerpo -> 400 y no modifica nada", async () => {
      const cliente = await crearUsuario("cliente");
      const direccion = await crear(cliente);

      for (const body of [{}, { esPrincipal: "true" }, { esPrincipal: true, calle: "Hackeada" }]) {
        assertErrorEstandar(
          await marcarPrincipal(cliente, direccion.id, body),
          400,
          "VALIDACION_FALLIDA"
        );
      }

      const guardada = await prisma.direccion.findUnique({ where: { id: direccion.id } });
      assert.equal(guardada.calle, DATOS.calle);
      assert.equal(guardada.esPrincipal, false);
    });

    it("id inválido -> 400; ajena, inexistente o eliminada -> 404 idéntico", async () => {
      const dueno = await crearUsuario("cliente");
      const intruso = await crearUsuario("cliente");
      const ajena = await crear(dueno);
      const eliminada = await crear(intruso);
      await borrar(intruso, eliminada.id);

      assertErrorEstandar(
        await marcarPrincipal(intruso, "abc", { esPrincipal: true }),
        400,
        "VALIDACION_FALLIDA"
      );
      const sobreAjena = await marcarPrincipal(intruso, ajena.id, { esPrincipal: true });
      const sobreInexistente = await marcarPrincipal(intruso, 2147483647, { esPrincipal: true });
      const sobreEliminada = await marcarPrincipal(intruso, eliminada.id, { esPrincipal: true });

      assertErrorEstandar(sobreAjena, 404, "DIRECCION_NO_ENCONTRADA");
      assert.deepEqual(sobreAjena.body, sobreInexistente.body);
      assert.deepEqual(sobreAjena.body, sobreEliminada.body);
      assert.equal(
        (await prisma.direccion.findUnique({ where: { id: ajena.id } })).esPrincipal,
        false
      );
    });
  });

  describe("concurrencia entre altas, ediciones y bajas del mismo usuario", () => {
    it("varios POST principal simultáneos dejan UNA sola principal", async () => {
      for (let ronda = 0; ronda < 3; ronda++) {
        const cliente = await crearUsuario("cliente");

        const respuestas = await Promise.all(
          Array.from({ length: 6 }, (_, i) =>
            api("POST", "/api/v1/direcciones", {
              token: cliente.token,
              body: { ...DATOS, destinatario: `Concurrente ${i}`, esPrincipal: true },
            })
          )
        );

        assert.deepEqual(
          respuestas.map((r) => r.status),
          Array(6).fill(201),
          JSON.stringify(respuestas.map((r) => r.body))
        );
        const lista = (await listar(cliente)).body;
        assert.equal(lista.length, 6);
        assert.equal(lista.filter((d) => d.esPrincipal).length, 1, `ronda ${ronda}`);
      }
    });

    it("POST principal junto con PUT, PATCH y DELETE: ningún 500 y como mucho una principal", async () => {
      for (let ronda = 0; ronda < 3; ronda++) {
        const cliente = await crearUsuario("cliente");
        const a = await crear(cliente, { esPrincipal: true });
        const b = await crear(cliente, { destinatario: "B" });
        const c = await crear(cliente, { destinatario: "C" });

        const respuestas = await Promise.all([
          ...Array.from({ length: 3 }, (_, i) =>
            api("POST", "/api/v1/direcciones", {
              token: cliente.token,
              body: { ...DATOS, destinatario: `Nueva ${i}`, esPrincipal: true },
            })
          ),
          editar(cliente, a.id, { ...DATOS, destinatario: "A editada", esPrincipal: true }),
          editar(cliente, b.id, { ...DATOS, destinatario: "B editada", esPrincipal: true }),
          marcarPrincipal(cliente, c.id, { esPrincipal: true }),
          borrar(cliente, a.id),
        ]);

        for (const r of respuestas) {
          assert.ok(
            [200, 201, 204, 404].includes(r.status),
            `ronda ${ronda}: ${r.status} ${JSON.stringify(r.body)}`
          );
        }
        const lista = (await listar(cliente)).body;
        assert.ok(lista.filter((d) => d.esPrincipal).length <= 1, `ronda ${ronda}`);
      }
    });
  });

  describe("campos que el cliente no controla y ediciones sin cambios", () => {
    it("PUT con usuarioId, id y eliminadaEn en el body: no se aplican", async () => {
      const dueno = await crearUsuario("cliente");
      const otro = await crearUsuario("cliente");
      const direccion = await crear(dueno);

      const respuesta = await editar(dueno, direccion.id, {
        ...DATOS,
        calle: "Calle legítima 1",
        usuarioId: otro.id,
        id: 2147483000,
        eliminadaEn: new Date().toISOString(),
      });

      assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
      const fila = await prisma.direccion.findUnique({ where: { id: direccion.id } });
      assert.equal(fila.usuarioId, dueno.id);
      assert.equal(fila.eliminadaEn, null);
      assert.equal(fila.calle, "Calle legítima 1");
      assert.equal((await listar(otro)).body.length, 0);
      assert.equal((await listar(dueno)).body.length, 1);
    });

    it("con pedidos, un PUT idéntico (con espacios y opcionales vacíos) no crea fila ni muta la histórica", async () => {
      const cliente = await crearUsuario("cliente");
      const direccion = await crearDireccion(cliente.id); // codigoPostal y referencia en NULL
      await pedidoDe(cliente, direccion);

      const respuesta = await editar(cliente, direccion.id, {
        destinatario: `  ${direccion.destinatario}  `,
        telefono: ` ${direccion.telefono} `,
        calle: direccion.calle,
        ciudad: direccion.ciudad,
        departamento: direccion.departamento,
        codigoPostal: "",
        referencia: "   ",
      });

      assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
      assert.equal(respuesta.body.id, direccion.id);
      assert.equal(await prisma.direccion.count({ where: { usuarioId: cliente.id } }), 1);
      const fila = await prisma.direccion.findUnique({ where: { id: direccion.id } });
      assert.equal(fila.codigoPostal, null, "NULL no se convierte en cadena vacía");
      assert.equal(fila.referencia, null);
    });

    it("con pedidos, un PUT idéntico con opcionales omitidos sobre una fila con '' no la reescribe", async () => {
      const cliente = await crearUsuario("cliente");
      const direccion = await crearDireccion(cliente.id);
      await prisma.direccion.update({
        where: { id: direccion.id },
        data: { codigoPostal: "", referencia: "" },
      });
      await pedidoDe(cliente, direccion);

      const respuesta = await editar(cliente, direccion.id, {
        destinatario: direccion.destinatario,
        telefono: direccion.telefono,
        calle: direccion.calle,
        ciudad: direccion.ciudad,
        departamento: direccion.departamento,
      });

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.id, direccion.id);
      assert.equal(await prisma.direccion.count({ where: { usuarioId: cliente.id } }), 1);
      const fila = await prisma.direccion.findUnique({ where: { id: direccion.id } });
      assert.equal(fila.codigoPostal, "");
      assert.equal(fila.referencia, "");
    });

    it("sin pedidos, los opcionales vacíos se guardan como NULL", async () => {
      const cliente = await crearUsuario("cliente");
      const direccion = await crear(cliente);

      const respuesta = await editar(cliente, direccion.id, {
        ...DATOS,
        codigoPostal: "",
        referencia: "  ",
      });

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.codigoPostal, null);
      assert.equal(respuesta.body.referencia, null);
    });

    it("una dirección de un pedido CANCELADO también cuenta como usada: se versiona y se da de baja", async () => {
      const cliente = await crearUsuario("cliente");
      const direccion = await crearDireccion(cliente.id);
      const variante = await crearVariante({ stock: 5 });
      await crearPedido({
        usuarioId: cliente.id,
        direccionId: direccion.id,
        lineas: [{ variante, cantidad: 1 }],
        estado: "CANCELADO",
        estadoEnvio: "EN_PREPARACION",
      });

      const nueva = (await editar(cliente, direccion.id, { ...DATOS, calle: "Calle nueva 1" })).body;
      assert.notEqual(nueva.id, direccion.id);
      assert.ok((await prisma.direccion.findUnique({ where: { id: direccion.id } })).eliminadaEn);

      const otra = await crearDireccion(cliente.id);
      await crearPedido({
        usuarioId: cliente.id,
        direccionId: otra.id,
        lineas: [{ variante, cantidad: 1 }],
        estado: "CANCELADO",
      });
      assert.equal((await borrar(cliente, otra.id)).status, 204);
      assert.ok((await prisma.direccion.findUnique({ where: { id: otra.id } })).eliminadaEn);
    });

    it("un id enorme responde el mismo 404 que uno inexistente (PUT, PATCH y DELETE)", async () => {
      const cliente = await crearUsuario("cliente");
      const inexistente = await editar(cliente, 2147483647, DATOS);

      const enorme = await editar(cliente, "999999999999", DATOS);
      const enormeBaja = await borrar(cliente, "999999999999");
      const enormePatch = await marcarPrincipal(cliente, "999999999999", { esPrincipal: true });

      assertErrorEstandar(enorme, 404, "DIRECCION_NO_ENCONTRADA");
      assert.deepEqual(enorme.body, inexistente.body);
      assert.deepEqual(enormeBaja.body, inexistente.body);
      assert.deepEqual(enormePatch.body, inexistente.body);
    });
  });

  describe("la dirección dentro del pedido muestra solo los datos de entrega", () => {
    const CAMPOS_DE_ENTREGA = [
      "calle",
      "ciudad",
      "codigoPostal",
      "departamento",
      "destinatario",
      "id",
      "referencia",
      "telefono",
    ];

    it("creación y detalle del pedido: sin usuarioId, esPrincipal ni eliminadaEn", async () => {
      const { cliente, direccion } = await clienteConZona();
      const variante = await crearVariante({ stock: 5 });
      await agregarAlCarrito(cliente.id, variante, 1);

      const creado = await api("POST", "/api/v1/pedidos", {
        token: cliente.token,
        body: { direccionId: direccion.id, metodoPago: "CONTRA_ENTREGA" },
      });
      assert.equal(creado.status, 201, JSON.stringify(creado.body));

      const detalle = await api("GET", `/api/v1/pedidos/${creado.body.pedido.id}`, {
        token: cliente.token,
      });

      assert.deepEqual(Object.keys(creado.body.pedido.direccion).sort(), CAMPOS_DE_ENTREGA);
      assert.deepEqual(Object.keys(detalle.body.direccion).sort(), CAMPOS_DE_ENTREGA);
    });
  });

  describe("la dirección cambia mientras se confirma la compra", () => {
    // Inyecta un cambio ENTRE el cálculo del costo de envío (fuera de la
    // transacción de creación) y la transacción que crea el pedido: es la
    // ventana en la que antes la compra se hacía con datos viejos.
    async function conCambioEntrePasos(cambio, fn) {
      const original = envioService.calcularCosto;
      const espia = mock.method(envioService, "calcularCosto", async (...args) => {
        const resultado = await original(...args);
        await cambio();
        return resultado;
      });

      try {
        return await fn();
      } finally {
        espia.mock.restore();
      }
    }

    async function comprar(cliente, direccionId) {
      return api("POST", "/api/v1/pedidos", {
        token: cliente.token,
        body: { direccionId, metodoPago: "CONTRA_ENTREGA" },
      });
    }

    async function preparar(conPedidoPrevio) {
      const { cliente, zona, direccion } = await clienteConZona();
      if (conPedidoPrevio) await pedidoDe(cliente, direccion);
      const variante = await crearVariante({ stock: 5 });
      await agregarAlCarrito(cliente.id, variante, 1);
      return { cliente, zona, direccion };
    }

    const pedidosDe = (cliente) => prisma.pedido.count({ where: { usuarioId: cliente.id } });

    it("A: un PUT versiona la dirección entre el costo y el pedido -> 404 y nada a medias", async () => {
      const { cliente, zona, direccion } = await preparar(true);

      const respuesta = await conCambioEntrePasos(
        async () => {
          const r = await editar(cliente, direccion.id, {
            ...DATOS,
            ciudad: zona.ciudad,
            departamento: zona.departamento,
            calle: "Calle versionada 1",
          });
          assert.equal(r.status, 200);
          assert.notEqual(r.body.id, direccion.id);
        },
        () => comprar(cliente, direccion.id)
      );

      assertErrorEstandar(respuesta, 404, "DIRECCION_NO_ENCONTRADA");
      assert.equal(await pedidosDe(cliente), 1);
      assert.equal((await itemsDelCarrito(cliente.id)).length, 1);
    });

    it("B: un PUT en el lugar cambia la ciudad entre el costo y el pedido -> 409 DIRECCION_MODIFICADA", async () => {
      const { cliente, direccion } = await preparar(false);

      const respuesta = await conCambioEntrePasos(
        async () => {
          const r = await editar(cliente, direccion.id, {
            ...DATOS,
            ciudad: `OtraCiudad-${sufijo()}`,
            departamento: direccion.departamento,
          });
          assert.equal(r.status, 200);
          assert.equal(r.body.id, direccion.id);
        },
        () => comprar(cliente, direccion.id)
      );

      assertErrorEstandar(respuesta, 409, "DIRECCION_MODIFICADA");
      assert.equal(await pedidosDe(cliente), 0);
      assert.equal((await itemsDelCarrito(cliente.id)).length, 1);
    });

    it("C: una baja física entre el costo y el pedido -> 404, no 500", async () => {
      const { cliente, direccion } = await preparar(false);

      const respuesta = await conCambioEntrePasos(
        async () => assert.equal((await borrar(cliente, direccion.id)).status, 204),
        () => comprar(cliente, direccion.id)
      );

      assertErrorEstandar(respuesta, 404, "DIRECCION_NO_ENCONTRADA");
      assert.equal(await pedidosDe(cliente), 0);
      assert.equal((await itemsDelCarrito(cliente.id)).length, 1);
    });

    it("compra y ediciones simultáneas: nunca un 500 y el pedido queda con una dirección existente", async () => {
      for (let ronda = 0; ronda < 3; ronda++) {
        const { cliente, zona, direccion } = await preparar(true);

        const [compra, edicion] = await Promise.all([
          comprar(cliente, direccion.id),
          editar(cliente, direccion.id, {
            ...DATOS,
            ciudad: zona.ciudad,
            departamento: zona.departamento,
            calle: `Calle simultánea ${ronda}`,
          }),
        ]);

        assert.ok([201, 404, 409].includes(compra.status), JSON.stringify(compra.body));
        assert.equal(edicion.status, 200, JSON.stringify(edicion.body));
        if (compra.status === 201) {
          const detalle = await api("GET", `/api/v1/pedidos/${compra.body.pedido.id}`, {
            token: cliente.token,
          });
          assert.equal(detalle.status, 200);
          assert.ok(detalle.body.direccion.calle);
        }
      }
    });

    it("esViolacionFkDeDireccion reconoce el P2003 de la FK de dirección y no otros", () => {
      const deDireccion = Object.assign(
        new Error("Foreign key constraint violated: `Pedido_direccionId_fkey`"),
        { code: "P2003" }
      );
      const deOtra = Object.assign(
        new Error("Foreign key constraint violated: `DetallePedido_varianteId_fkey`"),
        { code: "P2003" }
      );
      const conAdapter = Object.assign(new Error("Foreign key constraint violated"), {
        code: "P2003",
        meta: {
          driverAdapterError: {
            cause: { constraint: { index: "Pedido_direccionId_fkey" } },
          },
        },
      });

      assert.equal(pedidoService.esViolacionFkDeDireccion(deDireccion), true);
      assert.equal(pedidoService.esViolacionFkDeDireccion(conAdapter), true);
      assert.equal(pedidoService.esViolacionFkDeDireccion(deOtra), false);
      assert.equal(pedidoService.esViolacionFkDeDireccion(new Error("otra cosa")), false);
      assert.equal(pedidoService.esViolacionFkDeDireccion(null), false);
    });
  });

  describe("RN-003 sobre el repositorio compartido", () => {
    it("crearDireccion de los helpers sigue visible en el listado (no se rompió el esquema)", async () => {
      const cliente = await crearUsuario("cliente");
      const creada = await crearDireccion(cliente.id);

      const lista = (await listar(cliente)).body;

      assert.deepEqual(
        lista.map((d) => d.id),
        [creada.id]
      );
    });
  });
});
