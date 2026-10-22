import { Link } from "react-router-dom";

import Badge from "../common/Badge";
import Table from "../common/Table";
import { useAuth } from "../../hooks/useAuth";
import {
  GRUPOS_PEDIDOS,
  UMBRAL_STOCK_BAJO,
  useClientesRegistrados,
  useConteoPedidos,
  usePedidosRecientes,
  useProductosActivos,
  useResumenVentas,
  useStockInventario,
  useVentasUltimosDias,
} from "../../hooks/usePanelInicio";
import {
  badgeEstadoPedido,
  etiquetaEstadoPedido,
  formatearFecha,
  formatearPrecio,
} from "../orders/pedidoEstados";
import {
  badgeEstadoVenta,
  etiquetaEstadoVenta,
  textoVentas,
} from "../sales/ventaEstados";
import GraficoVentas from "./GraficoVentas";
import TarjetaEstadistica from "./TarjetaEstadistica";
import TarjetaPanel from "./TarjetaPanel";
import "./PanelInicio.css";

function numero(valor) {
  return valor.toLocaleString("es-CO");
}

// Tarjeta de un grupo de estados de pedido (cada una hace sus propias
// peticiones, así que una que falla no afecta a las demás).
function TarjetaConteoPedidos({ grupo }) {
  const fuente = useConteoPedidos(grupo);

  return (
    <TarjetaEstadistica
      titulo={grupo.titulo}
      color={grupo.color}
      icono={grupo.icono}
      fuente={fuente}
      contenido={(cantidad) => ({
        valor: numero(cantidad),
        detalle: grupo.detalle,
      })}
    />
  );
}

// Solo el admin (GET /usuarios es de admin): cuentas con rol cliente.
function TarjetaClientes() {
  const fuente = useClientesRegistrados();

  return (
    <TarjetaEstadistica
      titulo="Clientes registrados"
      color="blue"
      icono="♟"
      fuente={fuente}
      contenido={({ total, activos }) => ({
        valor: numero(total),
        detalle: `${numero(activos)} ${activos === 1 ? "activo" : "activos"}`,
      })}
    />
  );
}

function nombreDePedido(pedido) {
  return pedido.usuario?.nombre || `Usuario #${pedido.usuarioId}`;
}

const COLUMNAS_PEDIDOS = [
  { key: "numero", label: "N.º pedido" },
  { key: "cliente", label: "Cliente", render: nombreDePedido },
  {
    key: "estado",
    label: "Estado",
    render: (pedido) => (
      <Badge
        text={etiquetaEstadoPedido(pedido.estado)}
        type={badgeEstadoPedido(pedido.estado)}
      />
    ),
  },
  {
    key: "total",
    label: "Total",
    render: (pedido) => formatearPrecio(pedido.total),
  },
  {
    key: "fecha",
    label: "Fecha",
    render: (pedido) => formatearFecha(pedido.creadoEn),
  },
];

const COLUMNAS_VENTAS = [
  {
    key: "numeroPedido",
    label: "N.º pedido",
    render: (venta) => venta.numeroPedido ?? `#${venta.pedidoId}`,
  },
  {
    key: "cliente",
    label: "Cliente",
    render: (venta) => venta.cliente?.nombre || "—",
  },
  {
    key: "estado",
    label: "Estado",
    render: (venta) => (
      <Badge
        text={etiquetaEstadoVenta(venta.estado)}
        type={badgeEstadoVenta(venta.estado)}
      />
    ),
  },
  {
    key: "total",
    label: "Total",
    render: (venta) => formatearPrecio(venta.total),
  },
  {
    key: "fecha",
    label: "Fecha",
    render: (venta) => formatearFecha(venta.fecha),
  },
];

// Accesos a los paneles que existen en cada rol. Los de `soloAdmin` no se le
// ofrecen al vendedor (usuarios, roles, vendedores y zonas son de administración).
function accesosRapidos(base) {
  return [
    { to: `${base}/pedidos`, titulo: "Pedidos", detalle: "Gestioná el estado y el envío" },
    { to: `${base}/ventas`, titulo: "Ventas", detalle: "Consultá las ventas y sus totales" },
    { to: `${base}/productos`, titulo: "Productos", detalle: "Alta, edición y variantes" },
    { to: `${base}/inventario`, titulo: "Inventario", detalle: "Stock y ajustes por variante" },
    { to: "/admin/vendedores", titulo: "Vendedores", detalle: "Cuentas del personal de ventas", soloAdmin: true },
    { to: "/admin/usuarios", titulo: "Usuarios", detalle: "Activar o desactivar cuentas", soloAdmin: true },
    { to: "/admin/roles", titulo: "Roles", detalle: "Asignación de roles", soloAdmin: true },
    { to: "/admin/envios", titulo: "Zonas de envío", detalle: "Cobertura y tarifas", soloAdmin: true },
  ];
}

// Panel de inicio del personal (admin y vendedor): lo que ve cada rol justo
// después de iniciar sesión. Todo sale de la API real, sin cifras de ejemplo.
// En v1.0 admin y vendedor ven todas las ventas y pedidos, así que los datos
// son los mismos; el admin suma «Clientes registrados» y los accesos a
// vendedores, usuarios, roles y zonas.
//
// `envuelto`: el panel normalmente es el <main> de la pantalla (vendedor). Si
// una pantalla ya lo envuelve en su propio <main> (AdminLayout), se pasa
// `envuelto` y el panel usa un <div> para no anidar dos <main>.
export default function PanelInicio({ rol, envuelto = false }) {
  const Raiz = envuelto ? "div" : "main";
  const { usuario } = useAuth();
  const esAdmin = rol === "admin";
  const base = esAdmin ? "/admin" : "/vendedor";

  const resumenVentas = useResumenVentas();
  const ventasUltimosDias = useVentasUltimosDias();
  const pedidosRecientes = usePedidosRecientes();
  const productos = useProductosActivos();
  const stock = useStockInventario();

  const accesos = accesosRapidos(base).filter(
    (acceso) => esAdmin || !acceso.soloAdmin,
  );

  return (
    <Raiz className="panel-inicio">
      <header className="panel-inicio__encabezado">
        <h1>{esAdmin ? "Panel de administración" : "Panel de vendedor"}</h1>
        <p>
          {usuario?.nombre ? `Hola, ${usuario.nombre}. ` : ""}
          Este es el resumen de la tienda con los datos de ahora.
        </p>
      </header>

      <section className="panel-inicio__seccion" aria-labelledby="panel-ventas">
        <h2 id="panel-ventas">Ventas</h2>
        <dl className="panel-inicio__stats">
          <TarjetaEstadistica
            titulo="Ventas registradas"
            color="green"
            icono="$"
            fuente={resumenVentas}
            contenido={({ totales }) => ({
              valor: formatearPrecio(totales.registradas?.total),
              detalle: textoVentas(totales.registradas?.cantidad ?? 0),
            })}
          />
          <TarjetaEstadistica
            titulo="Ventas anuladas"
            color="red"
            icono="✕"
            fuente={resumenVentas}
            contenido={({ totales }) => ({
              valor: formatearPrecio(totales.anuladas?.total),
              detalle: textoVentas(totales.anuladas?.cantidad ?? 0),
            })}
          />
        </dl>
      </section>

      <section className="panel-inicio__seccion" aria-labelledby="panel-pedidos">
        <h2 id="panel-pedidos">Pedidos por estado</h2>
        <dl className="panel-inicio__stats">
          {GRUPOS_PEDIDOS.map((grupo) => (
            <TarjetaConteoPedidos key={grupo.clave} grupo={grupo} />
          ))}
        </dl>
      </section>

      <section className="panel-inicio__seccion" aria-labelledby="panel-tienda">
        <h2 id="panel-tienda">
          {esAdmin ? "Catálogo, inventario y clientes" : "Catálogo e inventario"}
        </h2>
        <dl className="panel-inicio__stats">
          <TarjetaEstadistica
            titulo="Productos activos"
            color="purple"
            icono="◆"
            fuente={productos}
            contenido={(cantidad) => ({
              valor: numero(cantidad),
              detalle: "Con al menos una variante en stock",
            })}
          />
          <TarjetaEstadistica
            titulo="Variantes con stock bajo"
            color="orange"
            icono="▦"
            fuente={stock}
            contenido={({ stockBajo }) => ({
              valor: numero(stockBajo),
              detalle: `De 1 a ${UMBRAL_STOCK_BAJO} unidades`,
            })}
          />
          <TarjetaEstadistica
            titulo="Variantes agotadas"
            color="red"
            icono="∅"
            fuente={stock}
            contenido={({ agotadas }) => ({
              valor: numero(agotadas),
              detalle: "Sin unidades en stock",
            })}
          />
          {esAdmin && <TarjetaClientes />}
        </dl>
      </section>

      <section
        className="panel-inicio__seccion"
        aria-labelledby="panel-actividad"
      >
        <h2 id="panel-actividad">Actividad reciente</h2>

        <TarjetaPanel
          titulo="Ventas de los últimos 30 días"
          descripcion="Ventas registradas por día (las anuladas no se cuentan)."
          fuente={ventasUltimosDias}
          estaVacio={(datos) => datos.dias.every((dia) => dia.cantidad === 0)}
          mensajeVacio="No hay ventas registradas en los últimos 30 días."
          filasEsqueleto={5}
          esGrafico
        >
          {(datos) => (
            <GraficoVentas
              dias={datos.dias}
              periodo={datos.periodo}
              incompleto={datos.incompleto}
            />
          )}
        </TarjetaPanel>

        <TarjetaPanel
          titulo="Pedidos recientes"
          descripcion="Los últimos 5 pedidos."
          enlace={{
            to: `${base}/pedidos`,
            texto: "Ver todos",
            ariaLabel: "Ver todos los pedidos",
          }}
          fuente={pedidosRecientes}
          estaVacio={(pedidos) => pedidos.length === 0}
          mensajeVacio="Todavía no hay pedidos."
        >
          {(pedidos) => <Table columns={COLUMNAS_PEDIDOS} rows={pedidos} />}
        </TarjetaPanel>

        <TarjetaPanel
          titulo="Ventas recientes"
          descripcion="Las últimas 5 ventas."
          enlace={{
            to: `${base}/ventas`,
            texto: "Ver todas",
            ariaLabel: "Ver todas las ventas",
          }}
          fuente={resumenVentas}
          estaVacio={(datos) => datos.recientes.length === 0}
          mensajeVacio="Todavía no hay ventas."
        >
          {(datos) => <Table columns={COLUMNAS_VENTAS} rows={datos.recientes} />}
        </TarjetaPanel>
      </section>

      <nav className="panel-inicio__seccion" aria-labelledby="panel-accesos">
        <h2 id="panel-accesos">Accesos rápidos</h2>
        <ul className="panel-inicio__accesos">
          {accesos.map((acceso) => (
            <li key={acceso.to}>
              <Link className="panel-inicio__acceso" to={acceso.to}>
                <strong>{acceso.titulo}</strong>
                <span>{acceso.detalle}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Raiz>
  );
}
