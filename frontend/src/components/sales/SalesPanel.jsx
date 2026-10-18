
import { useState } from "react";

import { useVentas } from "../../hooks/useVentas";
import Table from "../common/Table";
import Pagination from "../common/Pagination";
import Input from "../common/Input";
import Select from "../common/Select";
import Button from "../common/Button";
import Badge from "../common/Badge";
import Alert from "../common/Alert";
import Loading from "../common/Loading";

import "./SalesPanel.css";

const ESTADOS = [
  { value: "TODAS", label: "Todos los estados" },
  { value: "REGISTRADA", label: "Registrada" },
  { value: "ANULADA", label: "Anulada" },
];

const formatearMoneda = (valor) =>
  Number(valor ?? 0).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });

const formatearFecha = (fecha) => {
  if (!fecha) return "—";

  const fechaValida = new Date(fecha);

  if (Number.isNaN(fechaValida.getTime())) return "—";

  return fechaValida.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
  });
};

const obtenerNombreCliente = (venta) => {
  const cliente = venta.cliente ?? venta.usuario;

  if (typeof cliente === "string") return cliente;

  return (
    cliente?.nombreCompleto ??
    cliente?.nombre ??
    cliente?.nombreUsuario ??
    "—"
  );
};

const obtenerMetodoPago = (metodo) => {
  const metodos = {
    MERCADO_PAGO: "Mercado Pago",
    CONTRA_ENTREGA: "Contra entrega",
  };

  return metodos[metodo] ?? metodo ?? "—";
};

const obtenerNumeroPedido = (venta) =>
  venta.numeroPedido ??
  venta.pedido?.numero ??
  venta.pedido?.numeroPedido ??
  venta.pedidoId ??
  "—";

const obtenerTotales = (totales) => {
  if (!totales) return null;

  return {
    registradas: {
      cantidad:
        totales.registradas?.cantidad ??
        totales.registradas?.count ??
        totales.cantidadRegistradas ??
        0,
      total:
        totales.registradas?.total ??
        totales.totalRegistradas ??
        0,
    },
    anuladas: {
      cantidad:
        totales.anuladas?.cantidad ??
        totales.anuladas?.count ??
        totales.cantidadAnuladas ??
        0,
      total:
        totales.anuladas?.total ??
        totales.totalAnuladas ??
        0,
    },
  };
};

function SalesPanel() {
  const [filtros, setFiltros] = useState({
    desde: "",
    hasta: "",
    estado: "TODAS",
  });

  const [filtrosAplicados, setFiltrosAplicados] = useState({
    limite: 50,
  });

  const {
    ventas = [],
    paginacion = { pagina: 1, totalPaginas: 1 },
    cambiarPagina,
    loading,
    error,
    totales,
  } = useVentas(filtrosAplicados);

  const aplicarFiltros = (event) => {
    event.preventDefault();

    setFiltrosAplicados({
      ...(filtros.desde && { desde: filtros.desde }),
      ...(filtros.hasta && { hasta: filtros.hasta }),
      ...(filtros.estado !== "TODAS" && { estado: filtros.estado }),
      limite: 50,
      pagina: 1,
    });
  };

  const limpiarFiltros = () => {
    setFiltros({
      desde: "",
      hasta: "",
      estado: "TODAS",
    });

    setFiltrosAplicados({
      limite: 50,
      pagina: 1,
    });
  };

  const resumen = obtenerTotales(totales);

  const columns = [
    {
      key: "fecha",
      label: "Fecha",
      render: (venta) => formatearFecha(venta.fecha ?? venta.creadoEn),
    },
    {
      key: "pedido",
      label: "Número de pedido",
      render: (venta) => obtenerNumeroPedido(venta),
    },
    {
      key: "cliente",
      label: "Cliente",
      render: (venta) => obtenerNombreCliente(venta),
    },
    {
      key: "metodoPago",
      label: "Método de pago",
      render: (venta) => obtenerMetodoPago(venta.metodoPago),
    },
    {
      key: "total",
      label: "Total",
      render: (venta) => formatearMoneda(venta.total),
    },
    {
      key: "estado",
      label: "Estado",
      render: (venta) => (
        <Badge type={venta.estado === "REGISTRADA" ? "success" : "warning"}>
          {venta.estado}
        </Badge>
      ),
    },
    {
      key: "acciones",
      label: "Acciones",
      render: () => (
        <Button type="button" disabled>
          Ver detalle
        </Button>
      ),
    },
  ];

  return (
    <section className="sales-panel">
      <header className="sales-panel__header">
        <h2 className="sales-panel__title">Ventas</h2>
      </header>

      <form className="sales-panel__filters" onSubmit={aplicarFiltros}>
        <label className="sales-panel__field">
          <span>Desde</span>
          <Input
            type="date"
            value={filtros.desde}
            onChange={(event) =>
              setFiltros((actuales) => ({
                ...actuales,
                desde: event?.target?.value ?? event,
              }))
            }
          />
        </label>

        <label className="sales-panel__field">
          <span>Hasta</span>
          <Input
            type="date"
            value={filtros.hasta}
            onChange={(event) =>
              setFiltros((actuales) => ({
                ...actuales,
                hasta: event?.target?.value ?? event,
              }))
            }
          />
        </label>

        <label className="sales-panel__field">
          <span>Estado</span>
          <Select
            value={filtros.estado}
            options={ESTADOS}
            onChange={(event) =>
              setFiltros((actuales) => ({
                ...actuales,
                estado: event?.target?.value ?? event,
              }))
            }
          />
        </label>

        <div className="sales-panel__filter-actions">
          <Button type="submit">Aplicar</Button>
          <Button type="button" variant="secondary" onClick={limpiarFiltros}>
            Limpiar
          </Button>
        </div>
      </form>

      {resumen && (
        <div className="sales-panel__summary">
          <article className="sales-panel__summary-card">
            <h3>Ventas registradas</h3>
            <p>
              {resumen.registradas.cantidad} ·{" "}
              {formatearMoneda(resumen.registradas.total)}
            </p>
          </article>

          <article className="sales-panel__summary-card">
            <h3>Anuladas</h3>
            <p>
              {resumen.anuladas.cantidad} ·{" "}
              {formatearMoneda(resumen.anuladas.total)}
            </p>
          </article>
        </div>
      )}

      {error && (
        <Alert type="error">
          {typeof error === "string"
            ? error
            : error.message ?? "No fue posible cargar las ventas."}
        </Alert>
      )}

      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="sales-panel__table">
            <Table
              columns={columns}
              data={ventas}
              emptyMessage="No hay ventas para los filtros seleccionados."
            />
          </div>

          {paginacion.totalPaginas > 1 && (
            <div className="sales-panel__pagination">
              <Pagination
                currentPage={paginacion.pagina}
                totalPages={paginacion.totalPaginas}
                onPageChange={cambiarPagina}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default SalesPanel;
