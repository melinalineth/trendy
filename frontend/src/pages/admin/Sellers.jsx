import { useState } from "react";

import Table from "../../components/common/Table";
import Button from "../../components/common/Button";
import Loading from "../../components/common/Loading";
import Alert from "../../components/common/Alert";
import vendedorService from "../../services/vendedor.service";
import { useUsuarios } from "../../hooks/useUsuarios";
import "./Sellers.css";

const MENSAJE_ERROR_ACCION =
  "No pudimos actualizar el estado del vendedor. Intentá de nuevo.";

// El contrato de API no expone un endpoint dedicado para "listar solo
// vendedores" (no existe GET /api/v1/vendedores), así que reutilizamos
// GET /api/v1/usuarios (vía useUsuarios) y filtramos en el cliente por
// rol.nombre === "vendedor".
function Sellers() {
  const { usuarios, loading, error, actualizarEstadoLocal } = useUsuarios();
  const [errorAccion, setErrorAccion] = useState("");
  const [actualizandoId, setActualizandoId] = useState(null);

  const vendedores = usuarios.filter(
    (usuario) => usuario.rol?.nombre === "vendedor",
  );

  async function handleToggleEstado(vendedor) {
    const nuevoEstado = vendedor.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";

    setErrorAccion("");
    setActualizandoId(vendedor.id);

    try {
      await vendedorService.cambiarEstadoVendedor(vendedor.id, nuevoEstado);
      actualizarEstadoLocal(vendedor.id, nuevoEstado);
    } catch {
      setErrorAccion(MENSAJE_ERROR_ACCION);
    } finally {
      setActualizandoId(null);
    }
  }

  const columns = [
    { key: "nombre", label: "Nombre" },
    { key: "correo", label: "Correo" },
    { key: "estado", label: "Estado" },
    {
      key: "acciones",
      label: "Acciones",
      render: (vendedor) => (
        <Button
          text={
            actualizandoId === vendedor.id
              ? "Actualizando..."
              : vendedor.estado === "ACTIVO"
                ? "Desactivar"
                : "Activar"
          }
          onClick={() => handleToggleEstado(vendedor)}
          disabled={actualizandoId === vendedor.id}
        />
      ),
    },
  ];

  return (
    <div className="sellers-page">
      <h1>Vendedores</h1>

      {(error || errorAccion) && (
        <Alert type="error" message={error || errorAccion} />
      )}

      {loading ? (
        <Loading text="Cargando vendedores..." />
      ) : (
        <Table
          columns={columns}
          rows={vendedores}
          emptyMessage="No hay vendedores registrados."
        />
      )}
    </div>
  );
}

export default Sellers;
