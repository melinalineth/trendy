import { useMemo, useState } from "react";

import Table from "../common/Table";
import Modal from "../common/Modal";
import Button from "../common/Button";
import Input from "../common/Input";
import Loading from "../common/Loading";
import Alert from "../common/Alert";
import FormularioAjusteStock from "./FormularioAjusteStock";
import HistorialMovimientos from "./HistorialMovimientos";
import { useInventario } from "../../hooks/useInventario";
import "./InventarioPanel.css";

// Umbral puramente visual para resaltar filas con poco stock. El contrato
// de GET /inventario no trae un "stock mínimo" configurable por producto
// (a diferencia del Inventory.jsx viejo de admin, que lo inventaba con
// datos hardcodeados) — ver nota de diseño en pages/admin/Inventory.jsx.
const UMBRAL_STOCK_BAJO = 5;

// Panel de consulta y ajuste de stock (RF-017), reusado tal cual en
// /vendedor/inventario y /admin/inventario (Inventory.jsx de cada rol es un
// wrapper de una línea sobre este componente) — mismo patrón que
// ProductsPanel/Sellers/Users/Roles.
function InventarioPanel() {
  const { inventario, loading, error, recargar } = useInventario();

  const [busqueda, setBusqueda] = useState("");
  const [varianteAjuste, setVarianteAjuste] = useState(null);
  const [varianteHistorial, setVarianteHistorial] = useState(null);

  function abrirAjuste(variante) {
    setVarianteAjuste(variante);
  }

  function cerrarAjuste() {
    setVarianteAjuste(null);
  }

  function abrirHistorial(variante) {
    setVarianteHistorial(variante);
  }

  function cerrarHistorial() {
    setVarianteHistorial(null);
  }

  // Tras un ajuste exitoso se recarga el listado completo (mismo criterio
  // que ProductsPanel.handleGuardado): el stock resultante lo calcula el
  // backend, así que no se intenta sumar/restar a mano en el cliente.
  function handleAjusteGuardado() {
    recargar();
    cerrarAjuste();
  }

  const filasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return inventario;

    return inventario.filter((fila) => {
      const nombreProducto = fila.producto?.nombre?.toLowerCase() || "";
      const sku = fila.sku?.toLowerCase() || "";
      return nombreProducto.includes(texto) || sku.includes(texto);
    });
  }, [inventario, busqueda]);

  const columns = [
    {
      key: "producto",
      label: "Producto",
      render: (fila) => fila.producto?.nombre || "—",
    },
    { key: "sku", label: "SKU" },
    {
      key: "tallaColor",
      label: "Talla / Color",
      render: (fila) => `${fila.talla}${fila.color ? ` · ${fila.color}` : ""}`,
    },
    {
      key: "stock",
      label: "Stock actual",
      render: (fila) => (
        <span
          className={
            fila.stock <= UMBRAL_STOCK_BAJO
              ? "inventario-panel__stock inventario-panel__stock--bajo"
              : "inventario-panel__stock"
          }
        >
          {fila.stock}
        </span>
      ),
    },
    {
      key: "acciones",
      label: "Acciones",
      render: (fila) => (
        <div className="inventario-panel__acciones-fila">
          <Button text="Ajustar stock" onClick={() => abrirAjuste(fila)} />
          <Button text="Ver historial" onClick={() => abrirHistorial(fila)} />
        </div>
      ),
    },
  ];

  return (
    <div className="inventario-panel">
      <div className="inventario-panel__header">
        <h1>Inventario</h1>
      </div>

      {error && <Alert type="error" message={error} />}

      <div className="inventario-panel__toolbar">
        <Input
          name="busqueda"
          placeholder="Buscar por producto o SKU..."
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
        />
      </div>

      {loading ? (
        <Loading text="Cargando inventario..." />
      ) : (
        <Table
          columns={columns}
          rows={filasFiltradas}
          emptyMessage="No hay variantes con inventario registrado."
        />
      )}

      <Modal
        isOpen={Boolean(varianteAjuste)}
        onClose={cerrarAjuste}
        title={
          varianteAjuste
            ? `Ajustar stock — ${varianteAjuste.producto?.nombre} (${varianteAjuste.sku})`
            : "Ajustar stock"
        }
      >
        {varianteAjuste && (
          <FormularioAjusteStock
            varianteId={varianteAjuste.id}
            onGuardado={handleAjusteGuardado}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(varianteHistorial)}
        onClose={cerrarHistorial}
        title={
          varianteHistorial
            ? `Historial — ${varianteHistorial.producto?.nombre} (${varianteHistorial.sku})`
            : "Historial"
        }
      >
        {varianteHistorial && (
          <HistorialMovimientos varianteId={varianteHistorial.id} />
        )}
      </Modal>
    </div>
  );
}

export default InventarioPanel;
