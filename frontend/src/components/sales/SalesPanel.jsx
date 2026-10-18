import { useEffect, useState } from "react";

import Alert from "../common/Alert";
import Badge from "../common/Badge";
import Button from "../common/Button";
import Input from "../common/Input";
import Loading from "../common/Loading";
import Modal from "../common/Modal";
import Pagination from "../common/Pagination";
import Select from "../common/Select";
import Table from "../common/Table";
import { useVentas } from "../../hooks/useVentas";
import {
  etiquetaMetodoPago,
  formatearFecha,
  formatearPrecio,
} from "../orders/pedidoEstados";
import {
  ESTADOS_VENTA,
  badgeEstadoVenta,
  etiquetaEstadoVenta,
  textoVentas,
} from "./ventaEstados";
import SaleDetail from "./SaleDetail";
import "./SalesPanel.css";

// Valor del Select común para "sin filtro": su opción de placeholder está
// deshabilitada y con value "", así que no sirve para volver a "todas".
const TODAS = "TODAS";

const OPCIONES_ESTADO = [
  { value: TODAS, label: "Todos los estados" },
  ...ESTADOS_VENTA.map((estado) => ({
    value: estado,
    label: etiquetaEstadoVenta(estado),
  })),
];

function nombreCliente(venta) {
  return venta.cliente?.nombre || "—";
}

// Tarjeta del consolidado: cantidad y total de las ventas de un estado.
function TarjetaResumen({ titulo, resumen }) {
  return (
    <div className="sales-panel__resumen-card">
      <dt>{titulo}</dt>
      <dd>
        <strong>{formatearPrecio(resumen?.total)}</strong>
        <span className="sales-panel__muted">
          {textoVentas(resumen?.cantidad ?? 0)}
        </span>
      </dd>
    </div>
  );
}

// Consulta de ventas compartida por /admin/ventas y /vendedor/ventas
// (RF-042): listado con filtros por fecha y estado, consolidado y paginación.
// En v1.0 admin y vendedor ven TODAS las ventas; las «ventas asignadas» a cada
// vendedor quedan para una versión posterior.
export default function SalesPanel() {
  const {
    filtros,
    cambiarFiltro,
    aplicarFiltros,
    limpiarFiltros,
    errorFiltros,
    ventas,
    paginacion,
    totales,
    pagina,
    cambiarPagina,
    loading,
    error,
    recargar,
  } = useVentas();

  // Venta cuyo detalle se muestra en el Modal (null = cerrado). El detalle no
  // pide nada al backend: GET /ventas ya trae las líneas de cada venta.
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);

  // Escape cierra el modal (el Modal común no lo maneja).
  useEffect(() => {
    if (!ventaSeleccionada) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") setVentaSeleccionada(null);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [ventaSeleccionada]);

  function filtrar(event) {
    event.preventDefault();
    aplicarFiltros();
  }

  const columnas = [
    {
      key: "fecha",
      label: "Fecha",
      render: (venta) => formatearFecha(venta.fecha),
    },
    {
      key: "numeroPedido",
      label: "N.º pedido",
      render: (venta) => venta.numeroPedido ?? `#${venta.pedidoId}`,
    },
    {
      key: "cliente",
      label: "Cliente",
      render: (venta) => nombreCliente(venta),
    },
    {
      key: "metodoPago",
      label: "Pago",
      render: (venta) => etiquetaMetodoPago(venta.metodoPago),
    },
    {
      key: "total",
      label: "Total",
      render: (venta) => formatearPrecio(venta.total),
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
      key: "acciones",
      label: "Acciones",
      render: (venta) => (
        <Button
          className="sales-panel__btn--secundario"
          text={
            <>
              Ver detalle
              <span className="sales-panel__sr-only"> de la venta #{venta.id}</span>
            </>
          }
          onClick={() => setVentaSeleccionada(venta)}
        />
      ),
    },
  ];

  const totalPaginas = paginacion?.totalPaginas ?? 0;
  const mostrarTabla = !loading && (!error || ventas.length > 0);
  const mostrarResumen = !loading && !error && totales;

  return (
    <section className="sales-panel">
      <header className="sales-panel__header">
        <div>
          <h1>Ventas</h1>
          <p>Consultá las ventas y filtralas por fecha y estado.</p>
        </div>

        <Button
          className="sales-panel__btn--secundario"
          text={loading ? "Cargando..." : "Actualizar"}
          onClick={recargar}
          disabled={loading}
        />
      </header>

      <form
        className="sales-panel__filtros"
        onSubmit={filtrar}
        noValidate
        aria-label="Filtros de ventas"
      >
        <label className="sales-panel__campo">
          Desde
          <Input
            type="date"
            name="desde"
            value={filtros.desde}
            onChange={(e) => cambiarFiltro("desde", e.target.value)}
          />
        </label>

        <label className="sales-panel__campo">
          Hasta
          <Input
            type="date"
            name="hasta"
            value={filtros.hasta}
            onChange={(e) => cambiarFiltro("hasta", e.target.value)}
          />
        </label>

        <Select
          label="Estado"
          name="estado"
          value={filtros.estado || TODAS}
          onChange={(e) =>
            cambiarFiltro("estado", e.target.value === TODAS ? "" : e.target.value)
          }
          options={OPCIONES_ESTADO}
        />

        <div className="sales-panel__filtros-acciones">
          <Button type="submit" text="Filtrar" disabled={loading} />
          <Button
            className="sales-panel__btn--secundario"
            text="Limpiar filtros"
            onClick={limpiarFiltros}
            disabled={loading}
          />
        </div>
      </form>

      {errorFiltros && (
        <p role="alert" className="sales-panel__error-campo">
          {errorFiltros}
        </p>
      )}

      {error && !loading && (
        <div role="alert" className="sales-panel__error">
          <Alert type="error" message={error} />
          <Button text="Reintentar" onClick={recargar} />
        </div>
      )}

      {loading && <Loading text="Cargando ventas..." />}

      {mostrarResumen && (
        <section aria-label="Resumen de ventas">
          <dl className="sales-panel__resumen">
            <TarjetaResumen titulo="Ventas registradas" resumen={totales.registradas} />
            <TarjetaResumen titulo="Ventas anuladas" resumen={totales.anuladas} />
          </dl>
        </section>
      )}

      {mostrarTabla && (
        <>
          <Table
            columns={columnas}
            rows={ventas}
            emptyMessage="No hay ventas para los filtros seleccionados."
          />

          <p className="sales-panel__count">
            Ventas encontradas: {paginacion?.total ?? ventas.length}
          </p>

          {totalPaginas > 1 && (
            <nav className="sales-panel__paginacion" aria-label="Páginas de ventas">
              <Pagination
                currentPage={pagina}
                totalPages={totalPaginas}
                onPageChange={cambiarPagina}
              />
            </nav>
          )}
        </>
      )}

      <Modal
        isOpen={Boolean(ventaSeleccionada)}
        onClose={() => setVentaSeleccionada(null)}
        closeText="Cerrar"
        title={
          ventaSeleccionada
            ? `Venta #${ventaSeleccionada.id} — pedido ${ventaSeleccionada.numeroPedido ?? `#${ventaSeleccionada.pedidoId}`}`
            : ""
        }
      >
        {ventaSeleccionada && <SaleDetail venta={ventaSeleccionada} />}
      </Modal>
    </section>
  );
}
