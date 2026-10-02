import { useState } from "react";

import Table from "../../components/common/Table";
import Button from "../../components/common/Button";
import Loading from "../../components/common/Loading";
import Alert from "../../components/common/Alert";
import usuarioService from "../../services/usuario.service";
import { useUsuarios } from "../../hooks/useUsuarios";
import "./Users.css";

const MENSAJE_ERROR_ACCION =
  "No pudimos actualizar el estado del usuario. Intentá de nuevo.";

function Users() {
  const { usuarios, loading, error, actualizarEstadoLocal } = useUsuarios();
  const [errorAccion, setErrorAccion] = useState("");
  const [actualizandoId, setActualizandoId] = useState(null);

  async function handleToggleEstado(usuario) {
    const nuevoEstado = usuario.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";

    setErrorAccion("");
    setActualizandoId(usuario.id);

    try {
      await usuarioService.cambiarEstadoUsuario(usuario.id, nuevoEstado);
      actualizarEstadoLocal(usuario.id, nuevoEstado);
    } catch {
      setErrorAccion(MENSAJE_ERROR_ACCION);
    } finally {
      setActualizandoId(null);
    }
  }

  const columns = [
    { key: "nombre", label: "Nombre" },
    { key: "correo", label: "Correo" },
    {
      key: "rol",
      label: "Rol",
      render: (usuario) => usuario.rol?.nombre || "—",
    },
    { key: "estado", label: "Estado" },
    {
      key: "acciones",
      label: "Acciones",
      render: (usuario) => (
        <Button
          text={
            actualizandoId === usuario.id
              ? "Actualizando..."
              : usuario.estado === "ACTIVO"
                ? "Desactivar"
                : "Activar"
          }
          onClick={() => handleToggleEstado(usuario)}
          disabled={actualizandoId === usuario.id}
        />
      ),
    },
  ];

  return (
    <div className="users-page">
      <h1>Usuarios</h1>

      {(error || errorAccion) && (
        <Alert type="error" message={error || errorAccion} />
      )}

      {loading ? (
        <Loading text="Cargando usuarios..." />
      ) : (
        <Table
          columns={columns}
          rows={usuarios}
          emptyMessage="No hay usuarios registrados."
        />
      )}
    </div>
  );
}

export default Users;
