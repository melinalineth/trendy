import { useEffect, useState } from "react";

import Table from "../common/Table";
import Loading from "../common/Loading";
import Alert from "../common/Alert";
import inventarioService from "../../services/inventario.service";
import "./HistorialMovimientos.css";

const MENSAJE_ERROR =
  "No pudimos cargar el historial de esta variante. Intentá de nuevo.";

const ETIQUETAS_TIPO = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  AJUSTE: "Ajuste manual",
};

function formatearFecha(fechaIso) {
  if (!fechaIso) return "—";
  return new Date(fechaIso).toLocaleString("es-CO");
}

const RESULTADO_INICIAL = { varianteId: null, movimientos: [], error: "" };

// Historial de movimientos de una variante (RF-017), pensado para vivir
// dentro de un Modal abierto desde el botón "Ver historial" de
// InventarioPanel. Es un componente separado (en vez de una sección más de
// InventarioPanel) porque carga sus propios datos on-demand — no tiene
// sentido pedirle el historial de las 200 variantes al backend cuando el
// usuario solo va a mirar el de una a la vez.
//
// `loading` se deriva comparando resultado.varianteId con la prop en vez de
// un setLoading(true) síncrono al principio del efecto, para no disparar
// renders en cascada (react-hooks/set-state-in-effect) — mismo patrón que
// ProductDetail.jsx.
function HistorialMovimientos({ varianteId }) {
  const [resultado, setResultado] = useState(RESULTADO_INICIAL);

  useEffect(() => {
    let activo = true;

    inventarioService
      .obtenerHistorial(varianteId)
      .then((data) => {
        if (activo) {
          setResultado({ varianteId, movimientos: data, error: "" });
        }
      })
      .catch(() => {
        if (activo) {
          setResultado({ varianteId, movimientos: [], error: MENSAJE_ERROR });
        }
      });

    return () => {
      activo = false;
    };
  }, [varianteId]);

  const loading = resultado.varianteId !== varianteId;
  const { movimientos, error } = resultado;

  const columns = [
    {
      key: "creadoEn",
      label: "Fecha",
      render: (movimiento) => formatearFecha(movimiento.creadoEn),
    },
    {
      key: "tipoAjuste",
      label: "Tipo",
      render: (movimiento) =>
        ETIQUETAS_TIPO[movimiento.tipoAjuste] || movimiento.tipoAjuste,
    },
    { key: "cantidad", label: "Cantidad" },
    {
      key: "motivo",
      label: "Motivo",
      render: (movimiento) => movimiento.motivo || "—",
    },
    {
      key: "usuario",
      label: "Usuario",
      render: (movimiento) => movimiento.usuario?.nombre || "—",
    },
  ];

  return (
    <div className="historial-movimientos">
      {loading && <Loading text="Cargando historial..." />}
      {error && <Alert type="error" message={error} />}

      {!loading && !error && (
        <Table
          columns={columns}
          rows={movimientos}
          emptyMessage="Todavía no hay movimientos registrados para esta variante."
        />
      )}
    </div>
  );
}

export default HistorialMovimientos;
