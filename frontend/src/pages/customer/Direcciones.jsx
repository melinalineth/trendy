import { useEffect, useRef, useState } from "react";

import Modal from "../../components/common/Modal";
import Input from "../../components/common/Input";
import Button from "../../components/common/Button";
import Loading from "../../components/common/Loading";
import Alert from "../../components/common/Alert";
import { useDirecciones } from "../../hooks/useDirecciones";
import "./Direcciones.css";

// Campos obligatorios del formulario, con el mismo mensaje que devuelve el
// backend (direccion.dto.js) para que se vea igual venga de donde venga.
const CAMPOS_OBLIGATORIOS = [
  {
    name: "destinatario",
    etiqueta: "Destinatario",
    placeholder: "Nombre de quien recibe",
    mensaje: "El destinatario es requerido",
  },
  {
    name: "telefono",
    etiqueta: "Teléfono",
    placeholder: "Teléfono de contacto",
    mensaje: "El teléfono es requerido",
  },
  {
    name: "calle",
    etiqueta: "Calle",
    placeholder: "Calle y número",
    mensaje: "La calle es requerida",
  },
  {
    name: "ciudad",
    etiqueta: "Ciudad",
    placeholder: "Ciudad",
    mensaje: "La ciudad es requerida",
  },
  {
    name: "departamento",
    etiqueta: "Departamento",
    placeholder: "Departamento",
    mensaje: "El departamento es requerido",
  },
];

const CAMPOS_OPCIONALES = [
  {
    name: "codigoPostal",
    etiqueta: "Código postal (opcional)",
    placeholder: "Código postal",
  },
  {
    name: "referencia",
    etiqueta: "Referencia (opcional)",
    placeholder: "Punto de referencia",
  },
];

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

const TITULOS_MODAL = {
  crear: "Agregar dirección",
  editar: "Editar dirección",
  eliminar: "Eliminar dirección",
};

// Valores del formulario a partir de una dirección guardada (los opcionales
// vienen null del backend).
function valoresDe(direccion) {
  return {
    destinatario: direccion.destinatario,
    telefono: direccion.telefono,
    calle: direccion.calle,
    ciudad: direccion.ciudad,
    departamento: direccion.departamento,
    codigoPostal: direccion.codigoPostal ?? "",
    referencia: direccion.referencia ?? "",
    esPrincipal: Boolean(direccion.esPrincipal),
  };
}

// Cuerpo que espera el backend. PUT reemplaza los datos: un opcional vacío se
// manda sin valor para que quede vacío.
function armarDatos(valores) {
  return {
    destinatario: valores.destinatario.trim(),
    telefono: valores.telefono.trim(),
    calle: valores.calle.trim(),
    ciudad: valores.ciudad.trim(),
    departamento: valores.departamento.trim(),
    codigoPostal: valores.codigoPostal.trim() || undefined,
    referencia: valores.referencia.trim() || undefined,
    esPrincipal: valores.esPrincipal,
  };
}

function resumenDe(direccion) {
  return `${direccion.destinatario}, ${direccion.calle}, ${direccion.ciudad}`;
}

// Enfoca el primer campo del formulario al montarse: el Modal común no maneja
// el foco, así que cada contenido lo resuelve solo.
function useFocoInicial(ref) {
  useEffect(() => {
    ref.current?.querySelector("input, button")?.focus();
  }, [ref]);
}

// Foco inicial de la confirmación: cae en "Cancelar" (botón del pie del Modal
// común), nunca en la acción destructiva, para que un Enter accidental no
// elimine la dirección.
function useFocoEnCancelar(ref) {
  useEffect(() => {
    ref.current
      ?.closest(".modal")
      ?.querySelector(".modal__button--cancel")
      ?.focus();
  }, [ref]);
}

// Error de una acción del modal: el mensaje y, si el backend devolvió el
// detalle de la validación, la lista de problemas.
function ErrorAccion({ error }) {
  if (!error) return null;

  const esValidacion = error.codigo === "VALIDACION_FALLIDA";

  return (
    <div role="alert" className="direccion-form__error-general">
      <Alert
        type="error"
        message={
          esValidacion
            ? "No pudimos guardar la dirección. Revisá los datos e intentá de nuevo."
            : error.mensaje
        }
      />
      {esValidacion && error.detalles.length > 0 && (
        <ul className="direccion-form__detalles">
          {error.detalles.map((detalle) => (
            <li key={detalle}>{detalle}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Campo con label asociado (el Input común no expone `id`, por eso el label
// envuelve al input) y mensaje de error anunciado a lectores de pantalla.
function Campo({ etiqueta, error, children }) {
  return (
    <div className="direccion-form__campo">
      <label className="direccion-form__field">
        {etiqueta}
        {children}
      </label>
      {error && (
        <p role="alert" className="direccion-form__error">
          {error}
        </p>
      )}
    </div>
  );
}

// Alta y edición comparten el formulario: la edición lo abre con los valores
// de la dirección. Se monta de cero cada vez que se abre el modal, así el
// estado inicial sale de las props sin efectos de sincronización.
function FormularioDireccion({ modo, inicial, onGuardar, procesando, error }) {
  const formRef = useRef(null);
  const [valores, setValores] = useState(inicial);
  const [errores, setErrores] = useState({});

  useFocoInicial(formRef);

  function handleChange(campo) {
    return (event) => {
      const valor =
        event.target.type === "checkbox"
          ? event.target.checked
          : event.target.value;
      setValores((prev) => ({ ...prev, [campo]: valor }));
    };
  }

  function handleSubmit(event) {
    event.preventDefault();

    const nuevosErrores = {};
    for (const campo of CAMPOS_OBLIGATORIOS) {
      if (!valores[campo.name].trim()) nuevosErrores[campo.name] = campo.mensaje;
    }

    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) return;

    onGuardar(armarDatos(valores));
  }

  return (
    <form
      ref={formRef}
      className="direccion-form"
      onSubmit={handleSubmit}
      noValidate
    >
      <ErrorAccion error={error} />

      {CAMPOS_OBLIGATORIOS.map((campo) => (
        <Campo
          key={campo.name}
          etiqueta={campo.etiqueta}
          error={errores[campo.name]}
        >
          <Input
            name={campo.name}
            placeholder={campo.placeholder}
            value={valores[campo.name]}
            onChange={handleChange(campo.name)}
          />
        </Campo>
      ))}

      {CAMPOS_OPCIONALES.map((campo) => (
        <Campo key={campo.name} etiqueta={campo.etiqueta}>
          <Input
            name={campo.name}
            placeholder={campo.placeholder}
            value={valores[campo.name]}
            onChange={handleChange(campo.name)}
          />
        </Campo>
      ))}

      <label className="direccion-form__checkbox">
        <input
          type="checkbox"
          name="esPrincipal"
          checked={valores.esPrincipal}
          onChange={handleChange("esPrincipal")}
        />
        Usar como dirección principal
      </label>

      <Button
        type="submit"
        text={
          procesando
            ? "Guardando..."
            : modo === "editar"
              ? "Guardar cambios"
              : "Guardar dirección"
        }
        disabled={procesando}
      />
    </form>
  );
}

// Confirmación previa a eliminar. Cuenta lo que pasa de verdad: los pedidos
// ya hechos con esa dirección no se tocan (el backend los conserva).
function ConfirmarEliminar({ direccion, onConfirmar, procesando, error }) {
  const contenedorRef = useRef(null);

  useFocoEnCancelar(contenedorRef);

  return (
    <div ref={contenedorRef} className="direccion-form">
      <ErrorAccion error={error} />

      <div className="direccion-confirmar__resumen">
        <p className="direccion-confirmar__destinatario">
          {direccion.destinatario}
        </p>
        <p className="direccion-card__linea">
          {direccion.calle}, {direccion.ciudad}, {direccion.departamento}
        </p>
        <p className="direccion-card__telefono">{direccion.telefono}</p>
      </div>

      <p className="direccion-confirmar__texto">
        ¿Querés eliminar esta dirección? Los pedidos que ya hiciste con ella
        conservan sus datos de entrega.
        {direccion.esPrincipal &&
          " Es tu dirección principal: la más reciente de las que te queden pasará a serlo."}
      </p>

      <Button
        className="direccion-btn--peligro"
        text={procesando ? "Eliminando..." : "Eliminar dirección"}
        onClick={() => onConfirmar(direccion)}
        disabled={procesando}
      />
    </div>
  );
}

// Mis direcciones (RF-005): registrar, modificar, eliminar y marcar como
// principal. La selección durante la compra la hacen Carrito y Checkout.
function Direcciones() {
  const {
    direcciones,
    loading,
    error,
    crear,
    actualizar,
    marcarPrincipal,
    eliminar,
    recargar,
  } = useDirecciones();

  // { tipo: "crear" } | { tipo: "editar", direccion } | { tipo: "eliminar", direccion }
  const [modal, setModal] = useState(null);
  const [errorModal, setErrorModal] = useState(null);
  const [guardando, setGuardando] = useState(false);
  // Ids con una acción en curso desde la tarjeta ("Marcar como principal").
  const [ocupadas, setOcupadas] = useState([]);
  const [aviso, setAviso] = useState("");
  const [errorAccion, setErrorAccion] = useState("");

  // Bloqueos SÍNCRONOS: el estado no se actualiza entre dos clics del mismo
  // render, el ref sí. Un doble clic o un Enter repetido no manda dos pedidos.
  const guardandoRef = useRef(false);
  const ocupadasRef = useRef(new Set());

  // Foco: al cerrar un modal vuelve al control que lo abrió y, si ese control
  // ya no existe (la tarjeta se eliminó o cambió de id), al título.
  const aperturaRef = useRef(null);
  const tituloRef = useRef(null);

  useEffect(() => {
    if (modal !== null || !aperturaRef.current) return;

    const apertura = aperturaRef.current;
    aperturaRef.current = null;

    if (apertura.isConnected) {
      apertura.focus();
    } else {
      tituloRef.current?.focus();
    }
  }, [modal]);

  function abrirModal(nuevoModal) {
    aperturaRef.current = document.activeElement;
    setErrorModal(null);
    setAviso("");
    setErrorAccion("");
    setModal(nuevoModal);
  }

  function cerrarModal() {
    // No se cierra mientras se guarda: el resultado tiene que poder mostrarse
    // (o cerrar el modal) en el mismo lugar.
    if (guardandoRef.current) return;

    setErrorModal(null);
    setModal(null);
  }

  // Escape cierra el modal (el Modal común no lo maneja).
  useEffect(() => {
    if (!modal) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") cerrarModal();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  // Corre la acción del modal con el bloqueo puesto. Si sale bien, cierra y
  // avisa; si no, deja el modal abierto con el motivo.
  async function ejecutarDesdeModal(accion, mensajeExito) {
    if (guardandoRef.current) return;

    guardandoRef.current = true;
    setGuardando(true);
    setErrorModal(null);

    const resultado = await accion();

    guardandoRef.current = false;
    setGuardando(false);

    if (resultado.ok) {
      setModal(null);
      setAviso(mensajeExito);
    } else if (resultado.error.status === 404) {
      // La dirección ya no existe (se borró desde otra pestaña): no hay nada que
      // reintentar en el modal. Se cierra y se avisa; la lista ya se refrescó.
      setModal(null);
      setErrorAccion(resultado.error.mensaje);
    } else {
      setErrorModal(resultado.error);
    }
  }

  function handleGuardar(datos) {
    if (modal?.tipo === "editar") {
      return ejecutarDesdeModal(
        () => actualizar(modal.direccion.id, datos),
        "Dirección actualizada.",
      );
    }

    return ejecutarDesdeModal(() => crear(datos), "Dirección agregada.");
  }

  function handleEliminar(direccion) {
    return ejecutarDesdeModal(
      () => eliminar(direccion.id),
      "Dirección eliminada.",
    );
  }

  async function handleMarcarPrincipal(direccion) {
    if (ocupadasRef.current.has(direccion.id)) return;

    ocupadasRef.current.add(direccion.id);
    setOcupadas([...ocupadasRef.current]);
    setAviso("");
    setErrorAccion("");

    // Solo el flag: no se reenvían los datos de la tarjeta (podrían estar viejos).
    const resultado = await marcarPrincipal(direccion.id);

    ocupadasRef.current.delete(direccion.id);
    setOcupadas([...ocupadasRef.current]);

    if (resultado.ok) {
      setAviso(`Ahora la dirección de ${direccion.destinatario} es tu principal.`);
    } else {
      setErrorAccion(resultado.error.mensaje);
    }
  }

  const hayLista = direcciones.length > 0;
  const fallaDeCarga = Boolean(error) && !loading && !hayLista;

  return (
    <div className="direcciones-page">
      <div className="direcciones-page__header">
        <h1 ref={tituloRef} tabIndex={-1}>
          Mis direcciones
        </h1>
        <Button
          text="Agregar dirección"
          onClick={() => abrirModal({ tipo: "crear" })}
        />
      </div>

      <div aria-live="polite">
        {aviso && (
          <Alert type="success" message={aviso} onClose={() => setAviso("")} />
        )}
      </div>

      {errorAccion && (
        <div role="alert">
          <Alert type="error" message={errorAccion} />
        </div>
      )}

      {error && (hayLista || fallaDeCarga) && (
        <div role="alert" className="direcciones-page__error">
          <Alert type="error" message={error} />
          {fallaDeCarga && <Button text="Reintentar" onClick={recargar} />}
        </div>
      )}

      {loading ? (
        <Loading text="Cargando direcciones..." />
      ) : fallaDeCarga ? null : !hayLista ? (
        <p className="direcciones-page__vacio">
          Todavía no agregaste ninguna dirección.
        </p>
      ) : (
        <div className="direcciones-lista">
          {direcciones.map((direccion) => {
            const ocupada = ocupadas.includes(direccion.id);
            const sinAcciones = ocupada || guardando;
            const nombre = resumenDe(direccion);

            return (
              <article
                key={direccion.id}
                className="direccion-card"
                aria-labelledby={`direccion-${direccion.id}-destinatario`}
              >
                {direccion.esPrincipal && (
                  <span className="direccion-card__badge">Principal</span>
                )}

                <h2
                  id={`direccion-${direccion.id}-destinatario`}
                  className="direccion-card__destinatario"
                >
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

                <div className="direccion-card__acciones">
                  <Button
                    className="direccion-btn--secundario"
                    text="Editar"
                    ariaLabel={`Editar la dirección de ${nombre}`}
                    onClick={() => abrirModal({ tipo: "editar", direccion })}
                    disabled={sinAcciones}
                  />
                  {!direccion.esPrincipal && (
                    <Button
                      className="direccion-btn--secundario"
                      text={ocupada ? "Marcando..." : "Marcar como principal"}
                      ariaLabel={
                        ocupada
                          ? undefined
                          : `Marcar como principal la dirección de ${nombre}`
                      }
                      onClick={() => handleMarcarPrincipal(direccion)}
                      disabled={sinAcciones}
                    />
                  )}
                  <Button
                    className="direccion-btn--peligro"
                    text="Eliminar"
                    ariaLabel={`Eliminar la dirección de ${nombre}`}
                    onClick={() => abrirModal({ tipo: "eliminar", direccion })}
                    disabled={sinAcciones}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={Boolean(modal)}
        onClose={cerrarModal}
        title={modal ? TITULOS_MODAL[modal.tipo] : ""}
      >
        {modal?.tipo === "crear" && (
          <FormularioDireccion
            modo="crear"
            inicial={FORM_INICIAL}
            onGuardar={handleGuardar}
            procesando={guardando}
            error={errorModal}
          />
        )}

        {modal?.tipo === "editar" && (
          <FormularioDireccion
            key={modal.direccion.id}
            modo="editar"
            inicial={valoresDe(modal.direccion)}
            onGuardar={handleGuardar}
            procesando={guardando}
            error={errorModal}
          />
        )}

        {modal?.tipo === "eliminar" && (
          <ConfirmarEliminar
            direccion={modal.direccion}
            onConfirmar={handleEliminar}
            procesando={guardando}
            error={errorModal}
          />
        )}
      </Modal>
    </div>
  );
}

export default Direcciones;
