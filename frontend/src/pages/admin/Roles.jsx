import { useMemo, useState } from "react";

import Table from "../../components/common/Table";
import Modal from "../../components/common/Modal";
import Button from "../../components/common/Button";
import Loading from "../../components/common/Loading";
import Alert from "../../components/common/Alert";
import { useRoles } from "../../hooks/useRoles";
import "./Roles.css";

const MENSAJE_ERROR_GUARDAR =
  "No pudimos guardar los permisos. Intentá de nuevo.";

// El contrato de API no expone un catálogo de "todos los permisos
// disponibles" (no hay GET /api/v1/permisos), solo GET /api/v1/roles con
// los permisos ya asignados a cada rol. Armamos el catálogo de checkboxes
// como la unión (sin duplicados) de los permisos que aparecen en cualquier
// rol. Si esa unión queda vacía (backend sin seed de permisos todavía),
// mostramos un estado vacío en vez de una lista de checkboxes sin sentido.
function obtenerCatalogoPermisos(roles) {
  const mapa = new Map();

  roles.forEach((rol) => {
    (rol.permisos || []).forEach((permiso) => {
      mapa.set(permiso.id, permiso);
    });
  });

  return Array.from(mapa.values());
}

function Roles() {
  const { roles, loading, error, actualizarPermisos } = useRoles();
  const [rolEditando, setRolEditando] = useState(null);
  const [seleccion, setSeleccion] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState("");

  const catalogoPermisos = useMemo(
    () => obtenerCatalogoPermisos(roles),
    [roles],
  );

  function abrirModal(rol) {
    setRolEditando(rol);
    setSeleccion((rol.permisos || []).map((permiso) => permiso.id));
    setErrorModal("");
  }

  function cerrarModal() {
    setRolEditando(null);
  }

  function toggleSeleccion(permisoId) {
    setSeleccion((prev) =>
      prev.includes(permisoId)
        ? prev.filter((id) => id !== permisoId)
        : [...prev, permisoId],
    );
  }

  async function handleGuardar() {
    if (!rolEditando) return;

    setGuardando(true);
    setErrorModal("");

    const exito = await actualizarPermisos(rolEditando.id, seleccion);

    setGuardando(false);

    if (exito) {
      cerrarModal();
    } else {
      setErrorModal(MENSAJE_ERROR_GUARDAR);
    }
  }

  const columns = [
    { key: "nombre", label: "Rol" },
    {
      key: "permisos",
      label: "Permisos asignados",
      render: (rol) =>
        rol.permisos && rol.permisos.length > 0
          ? rol.permisos.map((permiso) => permiso.nombre).join(", ")
          : "Sin permisos asignados",
    },
    {
      key: "acciones",
      label: "Acciones",
      render: (rol) => (
        <Button text="Editar permisos" onClick={() => abrirModal(rol)} />
      ),
    },
  ];

  return (
    <div className="roles-page">
      <h1>Roles y permisos</h1>

      {error && <Alert type="error" message={error} />}

      {loading ? (
        <Loading text="Cargando roles..." />
      ) : (
        <Table
          columns={columns}
          rows={roles}
          emptyMessage="No hay roles registrados."
        />
      )}

      <Modal
        isOpen={rolEditando !== null}
        onClose={cerrarModal}
        title={rolEditando ? `Permisos de ${rolEditando.nombre}` : "Permisos"}
      >
        {errorModal && <Alert type="error" message={errorModal} />}

        {catalogoPermisos.length === 0 ? (
          <p className="roles-page__vacio">
            No hay permisos configurados todavía (el backend no tiene un seed
            de permisos cargado).
          </p>
        ) : (
          <>
            <div className="roles-page__permisos">
              {catalogoPermisos.map((permiso) => (
                <label key={permiso.id} className="roles-page__permiso">
                  <input
                    type="checkbox"
                    checked={seleccion.includes(permiso.id)}
                    onChange={() => toggleSeleccion(permiso.id)}
                  />
                  {permiso.nombre}
                </label>
              ))}
            </div>

            <Button
              text={guardando ? "Guardando..." : "Guardar permisos"}
              onClick={handleGuardar}
              disabled={guardando}
            />
          </>
        )}
      </Modal>
    </div>
  );
}

export default Roles;
