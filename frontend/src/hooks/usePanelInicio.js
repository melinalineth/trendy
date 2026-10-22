import { useCallback, useEffect, useRef, useState } from "react";
import ventaService from "../services/venta.service";
import pedidoService from "../services/pedido.service";
import productoService from "../services/producto.service";
import inventarioService from "../services/inventario.service";
import usuarioService from "../services/usuario.service";
import { obtenerErrorApi } from "../services/apiError";
import {
  agruparVentasPorDia,
  rangoUltimosDias,
} from "../components/dashboard/panelInicioUtils";

// Datos de los paneles de inicio de admin y vendedor. Cada hook es UNA fuente
// independiente (una petición o un pequeño grupo): si una falla, solo la
// tarjeta que la usa muestra el error; el resto del panel sigue funcionando.
// Reusan los servicios existentes (venta, pedido, producto, inventario,
// usuario): no hay endpoints propios del panel.

// Cuántas ventas recientes y pedidos recientes se listan.
const CANTIDAD_RECIENTES = 5;

// Gráfico de ventas: GET /ventas pagina de a 100 como máximo (límite del
// backend). Se recorren las páginas hasta MAX_PAGINAS_GRAFICO (1000 ventas en
// 30 días); si hubiera más, el gráfico lo avisa en vez de mostrar de menos sin
// decirlo.
const DIAS_GRAFICO = 30;
const VENTAS_POR_PAGINA_GRAFICO = 100;
const MAX_PAGINAS_GRAFICO = 10;

// Estados de pedido que cuenta cada tarjeta del panel (ver
// components/orders/pedidoEstados.js). Los estados PAGO_APROBADO,
// PAGO_RECHAZADO y PAGO_PENDIENTE son legados del enum: el flujo vigente no
// los produce, así que no tienen tarjeta.
export const GRUPOS_PEDIDOS = Object.freeze([
  Object.freeze({
    clave: "pendientes",
    titulo: "Pedidos pendientes",
    detalle: "Esperan el pago o la confirmación",
    estados: Object.freeze(["PENDIENTE"]),
    color: "orange",
    icono: "◔",
  }),
  Object.freeze({
    clave: "en-curso",
    titulo: "Pedidos en curso",
    detalle: "Confirmados, en preparación, enviados o en tránsito",
    estados: Object.freeze([
      "CONFIRMADO",
      "EN_PREPARACION",
      "ENVIADO",
      "EN_TRANSITO",
    ]),
    color: "blue",
    icono: "▤",
  }),
  Object.freeze({
    clave: "entregados",
    titulo: "Pedidos entregados",
    detalle: "Ya recibidos por el cliente",
    estados: Object.freeze(["ENTREGADO"]),
    color: "green",
    icono: "✓",
  }),
  Object.freeze({
    clave: "cancelados",
    titulo: "Pedidos cancelados",
    detalle: "Con el stock repuesto",
    estados: Object.freeze(["CANCELADO"]),
    color: "red",
    icono: "✕",
  }),
]);

// Umbral de «stock bajo» (el mismo que resalta InventarioPanel).
export const UMBRAL_STOCK_BAJO = 5;

// Estado de una fuente: { datos, cargando, error, recargar }. `cargar` debe
// ser una función ESTABLE (de módulo o con useCallback) que devuelve una
// promesa con los datos. Una respuesta tardía de una carga anterior se
// descarta (mismo patrón que useGestionPedidos).
function useFuente(cargar, mensajePorDefecto) {
  const [estado, setEstado] = useState({
    datos: null,
    cargando: true,
    error: "",
  });
  const solicitudRef = useRef(0);

  const ejecutar = useCallback(() => {
    const solicitud = ++solicitudRef.current;
    const vigente = () => solicitud === solicitudRef.current;

    return cargar()
      .then((datos) => {
        if (vigente()) setEstado({ datos, cargando: false, error: "" });
      })
      .catch((err) => {
        if (!vigente()) return;
        setEstado({
          datos: null,
          cargando: false,
          error: obtenerErrorApi(err, mensajePorDefecto).mensaje,
        });
      });
  }, [cargar, mensajePorDefecto]);

  // El estado solo cambia en los callbacks de la promesa.
  useEffect(() => {
    ejecutar();

    return () => {
      solicitudRef.current += 1;
    };
  }, [ejecutar]);

  const recargar = useCallback(() => {
    setEstado((previo) => ({ ...previo, cargando: true, error: "" }));
    return ejecutar();
  }, [ejecutar]);

  return { ...estado, recargar };
}

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------

// GET /ventas?limite=5: las 5 ventas más recientes y, en `totales`, el
// consolidado de TODAS las ventas (cantidad y total de registradas y de
// anuladas; no depende de la página).
function cargarResumenVentas() {
  return ventaService.listarVentas({ limite: CANTIDAD_RECIENTES }).then((data) => {
    if (!data?.totales) {
      throw new Error("La respuesta de ventas no trae los totales.");
    }

    return {
      totales: data.totales,
      recientes: Array.isArray(data.ventas) ? data.ventas : [],
    };
  });
}

const MENSAJE_ERROR_VENTAS = "No pudimos cargar las ventas. Intentá de nuevo.";

export function useResumenVentas() {
  return useFuente(cargarResumenVentas, MENSAJE_ERROR_VENTAS);
}

// GET /ventas de los últimos 30 días de Bogotá (solo REGISTRADAS: las anuladas
// no son ingresos), pasando por todas las páginas hasta el tope. Devuelve
//   - dias: [{ fecha, cantidad, total }] uno por día, de más viejo a más nuevo,
//   - periodo: { desde, hasta },
//   - totalPeriodo: { cantidad, total } que informa el backend para el período
//     (el gráfico debe sumar lo mismo),
//   - incompleto: true si hay más ventas que las que se recorrieron.
async function cargarVentasUltimosDias() {
  const { desde, hasta, dias } = rangoUltimosDias(DIAS_GRAFICO);
  const ventas = [];
  let totalPeriodo = null;
  let totalPaginas = 1;

  for (let pagina = 1; pagina <= Math.min(totalPaginas, MAX_PAGINAS_GRAFICO); pagina += 1) {
    const data = await ventaService.listarVentas({
      desde,
      hasta,
      estado: "REGISTRADA",
      pagina,
      limite: VENTAS_POR_PAGINA_GRAFICO,
    });

    if (!data?.totales?.registradas) {
      throw new Error("La respuesta de ventas no trae los totales.");
    }

    totalPeriodo = data.totales.registradas;
    totalPaginas = data.paginacion?.totalPaginas ?? 1;
    if (Array.isArray(data.ventas)) ventas.push(...data.ventas);
  }

  return {
    dias: agruparVentasPorDia(ventas, dias),
    periodo: { desde, hasta },
    totalPeriodo,
    incompleto: totalPaginas > MAX_PAGINAS_GRAFICO,
  };
}

const MENSAJE_ERROR_GRAFICO =
  "No pudimos cargar las ventas de los últimos 30 días. Intentá de nuevo.";

export function useVentasUltimosDias() {
  return useFuente(cargarVentasUltimosDias, MENSAJE_ERROR_GRAFICO);
}

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

// GET /pedidos?limite=5: los 5 pedidos más recientes (con `usuario`).
function cargarPedidosRecientes() {
  return pedidoService
    .listarPedidos({ limite: CANTIDAD_RECIENTES })
    .then((data) => (Array.isArray(data?.pedidos) ? data.pedidos : []));
}

const MENSAJE_ERROR_PEDIDOS =
  "No pudimos cargar los pedidos. Intentá de nuevo.";

export function usePedidosRecientes() {
  return useFuente(cargarPedidosRecientes, MENSAJE_ERROR_PEDIDOS);
}

// Cantidad de pedidos de un estado: GET /pedidos?estado=X&limite=1 solo para
// leer `paginacion.total` (el backend no tiene un endpoint de conteos).
function contarPedidosDeEstado(estado) {
  return pedidoService
    .listarPedidos({ estado, limite: 1 })
    .then((data) => {
      const total = data?.paginacion?.total;

      if (!Number.isInteger(total)) {
        throw new Error("La respuesta de pedidos no trae el total.");
      }

      return total;
    });
}

// Suma los pedidos de todos los estados de un grupo de GRUPOS_PEDIDOS.
export function useConteoPedidos(grupo) {
  const cargar = useCallback(
    () =>
      Promise.all(grupo.estados.map(contarPedidosDeEstado)).then((conteos) =>
        conteos.reduce((suma, cantidad) => suma + cantidad, 0),
      ),
    [grupo],
  );

  return useFuente(cargar, MENSAJE_ERROR_PEDIDOS);
}

// ---------------------------------------------------------------------------
// Catálogo, inventario y clientes
// ---------------------------------------------------------------------------

// GET /productos devuelve SOLO los productos ACTIVOS con al menos una variante
// con stock (regla RN-001 del catálogo; no hay una variante de staff que traiga
// también los inactivos o agotados), así que su cantidad es la de productos
// activos con stock.
function cargarProductosActivos() {
  return productoService
    .listarProductos()
    .then((data) => (Array.isArray(data) ? data.length : 0));
}

const MENSAJE_ERROR_PRODUCTOS =
  "No pudimos cargar los productos. Intentá de nuevo.";

export function useProductosActivos() {
  return useFuente(cargarProductosActivos, MENSAJE_ERROR_PRODUCTOS);
}

// GET /inventario: todas las variantes con su stock. Las agotadas (stock 0) y
// las de stock bajo (1 a UMBRAL_STOCK_BAJO) se cuentan por separado, así que no
// se pisan.
function cargarStockInventario() {
  return inventarioService.listarInventario().then((data) => {
    const variantes = Array.isArray(data) ? data : [];

    return {
      agotadas: variantes.filter((variante) => variante.stock <= 0).length,
      stockBajo: variantes.filter(
        (variante) => variante.stock > 0 && variante.stock <= UMBRAL_STOCK_BAJO,
      ).length,
    };
  });
}

const MENSAJE_ERROR_INVENTARIO =
  "No pudimos cargar el inventario. Intentá de nuevo.";

export function useStockInventario() {
  return useFuente(cargarStockInventario, MENSAJE_ERROR_INVENTARIO);
}

// GET /usuarios (solo admin): cuentas con rol cliente, en total y activas.
function cargarClientesRegistrados() {
  return usuarioService.listarUsuarios().then((data) => {
    const clientes = (Array.isArray(data) ? data : []).filter(
      (usuario) => usuario.rol?.nombre === "cliente",
    );

    return {
      total: clientes.length,
      activos: clientes.filter((usuario) => usuario.estado === "ACTIVO").length,
    };
  });
}

const MENSAJE_ERROR_CLIENTES =
  "No pudimos cargar los clientes. Intentá de nuevo.";

export function useClientesRegistrados() {
  return useFuente(cargarClientesRegistrados, MENSAJE_ERROR_CLIENTES);
}
