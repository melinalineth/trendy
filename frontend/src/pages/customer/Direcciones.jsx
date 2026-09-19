import { useState } from "react";

import Modal from "../../components/common/Modal";
import Input from "../../components/common/Input";
import Button from "../../components/common/Button";
import Loading from "../../components/common/Loading";
import Alert from "../../components/Alert";
import { useDirecciones } from "../../hooks/useDirecciones";
import "./Direcciones.css";

const FORM_INICIAL = {
  destinatario: "",
  telefono: "",
  calle: "",
  ciudad: "",
  departamento: "",
  codigoPostal: "",
  referencia: "",
  esPrincipal: false,
};

function Direcciones() {
  const { direcciones, loading, error, crear } = useDirecciones();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  const [errorForm, setErrorForm] = useState("");
  const [guardando, setGuardando] = useState(false);

  function abrirModal() {
    setForm(FORM_INICIAL);
    setErrorForm("");
    setModalAbierto(true);
  }

  function cerrarModal() {
    setModalAbierto(false);
  }

  function handleChange(campo) {
    return (event) => {
      const valor =
        event.target.type === "checkbox"
          ? event.target.checked
          : event.target.value;
      setForm((prev) => ({ ...prev, [campo]: valor }));
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorForm("");
    setGuardando(true);

    const datos = {
      ...form,
      codigoPostal: form.codigoPostal || undefined,
      referencia: form.referencia || undefined,
    };

    const exito = await crear(datos);

    setGuardando(false);

    if (exito) {
      cerrarModal();
    } else {
      setErrorForm(
        "No pudimos guardar la dirección. Revisá los datos e intentá de nuevo.",
      );
    }
  }

  return (
    <div className="direcciones-page">
      <div className="direcciones-page__header">
        <h1>Mis direcciones</h1>
        <Button text="Agregar dirección" onClick={abrirModal} />
      </div>

      {error && <Alert type="error" message={error} />}

      {loading ? (
        <Loading text="Cargando direcciones..." />
      ) : direcciones.length === 0 ? (
        <p className="direcciones-page__vacio">
          Todavía no agregaste ninguna dirección.
        </p>
      ) : (
        <div className="direcciones-lista">
          {direcciones.map((direccion) => (
            <div key={direccion.id} className="direccion-card">
              {direccion.esPrincipal && (
                <span className="direccion-card__badge">Principal</span>
              )}

              <h2 className="direccion-card__destinatario">
                {direccion.destinatario}
              </h2>
              <p className="direccion-card__telefono">{direccion.telefono}</p>
              <p className="direccion-card__linea">
                {direccion.calle}, {direccion.ciudad}, {direccion.departamento}
              </p>
              {direccion.codigoPostal && (
                <p className="direccion-card__linea">
                  CP: {direccion.codigoPostal}
                </p>
              )}
              {direccion.referencia && (
                <p className="direccion-card__referencia">
                  {direccion.referencia}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalAbierto}
        onClose={cerrarModal}
        title="Agregar dirección"
      >
        <form className="direccion-form" onSubmit={handleSubmit}>
          {errorForm && <Alert type="error" message={errorForm} />}

          <label className="direccion-form__field">
            Destinatario
            <Input
              name="destinatario"
              placeholder="Nombre de quien recibe"
              value={form.destinatario}
              onChange={handleChange("destinatario")}
            />
          </label>

          <label className="direccion-form__field">
            Teléfono
            <Input
              name="telefono"
              placeholder="Teléfono de contacto"
              value={form.telefono}
              onChange={handleChange("telefono")}
            />
          </label>

          <label className="direccion-form__field">
            Calle
            <Input
              name="calle"
              placeholder="Calle y número"
              value={form.calle}
              onChange={handleChange("calle")}
            />
          </label>

          <label className="direccion-form__field">
            Ciudad
            <Input
              name="ciudad"
              placeholder="Ciudad"
              value={form.ciudad}
              onChange={handleChange("ciudad")}
            />
          </label>

          <label className="direccion-form__field">
            Departamento
            <Input
              name="departamento"
              placeholder="Departamento"
              value={form.departamento}
              onChange={handleChange("departamento")}
            />
          </label>

          <label className="direccion-form__field">
            Código postal (opcional)
            <Input
              name="codigoPostal"
              placeholder="Código postal"
              value={form.codigoPostal}
              onChange={handleChange("codigoPostal")}
            />
          </label>

          <label className="direccion-form__field">
            Referencia (opcional)
            <Input
              name="referencia"
              placeholder="Punto de referencia"
              value={form.referencia}
              onChange={handleChange("referencia")}
            />
          </label>

          <label className="direccion-form__checkbox">
            <input
              type="checkbox"
              name="esPrincipal"
              checked={form.esPrincipal}
              onChange={handleChange("esPrincipal")}
            />
            Usar como dirección principal
          </label>

          <Button
            type="submit"
            text={guardando ? "Guardando..." : "Guardar dirección"}
            disabled={guardando}
          />
        </form>
      </Modal>
    </div>
  );
}

export default Direcciones;
