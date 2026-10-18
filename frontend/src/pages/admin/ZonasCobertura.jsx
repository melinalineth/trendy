import { useEffect, useRef, useState } from "react";

import Table from "../../components/common/Table";
import Modal from "../../components/common/Modal";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import Badge from "../../components/common/Badge";
import Loading from "../../components/common/Loading";
import Alert from "../../components/common/Alert";
import { useZonasCobertura } from "../../hooks/useZonasCobertura";
import "./ZonasCobertura.css";

// Límites alineados con el DTO del backend (zonaCobertura.dto.js): textos de
// hasta 100 caracteres y costo entero (pesos COP, sin centavos) entre 1 y
// 1.000.000. Regla "COP en pesos enteros": docs/diseno/montos-cop.md.
const LARGO_MAXIMO_TEXTO = 100;
const COSTO_MAXIMO = 1000000;

const VALORES_INICIALES = {
  nombre: "",
  departamento: "",
  ciudad: "",
  costo: "",
};

function formatearCosto(costo) {
  if (typeof costo !== "number") return "—";
  // Enteros sin decimales ($12.000); con centavos, siempre 2 ($12.000,50).
  const decimales = Number.isInteger(costo) ? 0 : 2;

  return `$${costo.toLocaleString("es-CO", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })}`;
}

// Devuelve el mensaje de error del campo de texto, o "" si es válido.
function validarTexto(valor, etiqueta) {
  const texto = valor.trim();

  if (!texto) return `${etiqueta} es obligatorio.`;

  if (texto.length > LARGO_MAXIMO_TEXTO) {
    return `${etiqueta} no puede superar los ${LARGO_MAXIMO_TEXTO} caracteres.`;
  }

  return "";
}

// Devuelve el mensaje de error del costo, o "" si es válido. Misma regla que
// el backend: número finito, entero (sin centavos), >= 1 y <= 1.000.000.
function validarCosto(valor) {
  const texto = valor.trim();

  if (!texto) return "El costo es obligatorio.";

  const costo = Number(texto);

  if (!Number.isFinite(costo)) return "El costo debe ser un número válido.";

  if (costo <= 0) return "El costo debe ser un número mayor que cero.";

  if (!Number.isInteger(costo)) {
    return "El costo debe ser un valor entero en pesos (COP), sin centavos.";
  }

  if (costo > COSTO_MAXIMO) {
    return `El costo no puede superar ${formatearCosto(COSTO_MAXIMO)}.`;
  }

  return "";
}

// Enfoca el primer control (input o botón) del contenedor al montarse: el
// Modal común no maneja el foco, así que cada contenido lo resuelve solo.
function useFocoInicial(ref) {
  useEffect(() => {
    ref.current?.querySelector("input, button")?.focus();
  }, [ref]);
}

// Foco inicial del modal de confirmación: cae en "Cancelar" (botón del footer
// del Modal común), nunca en la acción destructiva, para que un Enter
// accidental no confirme la desactivación.
function useFocoEnCancelar(ref) {
  useEffect(() => {
    ref.current
      ?.closest(".modal")
      ?.querySelector(".modal__button--cancel")
      ?.focus();
  }, [ref]);
}

function ErrorFormulario({ error }) {
  if (!error) return null;

  const esValidacion = error.codigo === "VALIDACION_FALLIDA";

  return (
    <div role="alert" className="zonas-form__error-general">
      <Alert
        type="error"
        message={esValidacion ? "Revisá los datos ingresados." : error.mensaje}
      />
      {esValidacion && error.detalles.length > 0 && (
        <ul className="zonas-form__detalles">
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
    <div className="zonas-form__campo">
      <label className="zonas-form__label">
        {etiqueta}
        {children}
      </label>
      {error && (
        <p role="alert" className="zonas-form__error">
          {error}
        </p>
      )}
    </div>
  );
}

// Alta de zona (RF-026): nombre, departamento, ciudad y tarifa inicial. Vive
// dentro de un Modal, que ya trae su propio botón "Cancelar" en el footer.
function FormularioZona({ onGuardar, procesando }) {
  const formRef = useRef(null);
  const [valores, setValores] = useState(VALORES_INICIALES);
  const [errores, setErrores] = useState({});
  const [errorApi, setErrorApi] = useState(null);

  useFocoInicial(formRef);

  function handleChange(campo) {
    return (event) => {
      setValores((actuales) => ({ ...actuales, [campo]: event.target.value }));
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorApi(null);

    const nuevosErrores = {
      nombre: validarTexto(valores.nombre, "El nombre"),
      departamento: validarTexto(valores.departamento, "El departamento"),
      ciudad: validarTexto(valores.ciudad, "La ciudad"),
      costo: validarCosto(valores.costo),
    };

    const hayErrores = Object.values(nuevosErrores).some(Boolean);
    setErrores(nuevosErrores);

    if (hayErrores) return;

    const resultado = await onGuardar({
      nombre: valores.nombre.trim(),
      departamento: valores.departamento.trim(),
      ciudad: valores.ciudad.trim(),
      costo: Number(valores.costo.trim()),
    });

    if (!resultado.ok && resultado.error) setErrorApi(resultado.error);
  }

  return (
    <form
      ref={formRef}
      className="zonas-form"
      onSubmit={handleSubmit}
      noValidate
    >
      <ErrorFormulario error={errorApi} />

      <Campo etiqueta="Nombre de la zona" error={errores.nombre}>
        <Input
          name="nombre"
          placeholder="ej. Bogotá urbano"
          value={valores.nombre}
          onChange={handleChange("nombre")}
        />
      </Campo>

      <Campo etiqueta="Departamento" error={errores.departamento}>
        <Input
          name="departamento"
          placeholder="ej. Cundinamarca"
          value={valores.departamento}
          onChange={handleChange("departamento")}
        />
      </Campo>

      <Campo etiqueta="Ciudad" error={errores.ciudad}>
        <Input
          name="ciudad"
          placeholder="ej. Bogotá"
          value={valores.ciudad}
          onChange={handleChange("ciudad")}
        />
      </Campo>

      <Campo etiqueta="Costo de envío (COP)" error={errores.costo}>
        <Input
          type="number"
          name="costo"
          step="1"
          placeholder="ej. 12000"
          value={valores.costo}
          onChange={handleChange("costo")}
        />
      </Campo>

      <div className="zonas-form__acciones">
        <Button
          type="submit"
          text={procesando ? "Guardando..." : "Crear zona"}
          disabled={procesando}
        />
      </div>
    </form>
  );
}

// Cambio de tarifa de una zona: el backend desactiva la tarifa vigente y
// crea la nueva (el historial se conserva).
function FormularioTarifa({ zona, onGuardar, procesando }) {
  const formRef = useRef(null);
  const [costo, setCosto] = useState("");
  const [errorCosto, setErrorCosto] = useState("");
  const [errorApi, setErrorApi] = useState(null);

  useFocoInicial(formRef);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorApi(null);

    const mensaje = validarCosto(costo);
    setErrorCosto(mensaje);

    if (mensaje) return;

    const resultado = await onGuardar(zona.id, Number(costo.trim()));

    if (!resultado.ok && resultado.error) setErrorApi(resultado.error);
  }

  return (
    <form
      ref={formRef}
      className="zonas-form"
      onSubmit={handleSubmit}
      noValidate
    >
      <ErrorFormulario error={errorApi} />

      <p className="zonas-form__resumen">
        Zona: <strong>{zona.nombre}</strong> ({zona.ciudad}, {zona.departamento}
        ). Tarifa actual:{" "}
        <strong>{formatearCosto(zona.tarifaActiva?.costo)}</strong>
      </p>

      <Campo etiqueta="Nuevo costo de envío (COP)" error={errorCosto}>
        <Input
          type="number"
          name="costo"
          step="1"
          placeholder="ej. 15000"
          value={costo}
          onChange={(event) => setCosto(event.target.value)}
        />
      </Campo>

      <div className="zonas-form__acciones">
        <Button
          type="submit"
          text={procesando ? "Guardando..." : "Guardar tarifa"}
          disabled={procesando}
        />
      </div>
    </form>
  );
}

// Confirmación previa a desactivar: una zona inactiva deja de calcular envío.
function ConfirmarDesactivar({ zona, onConfirmar, procesando, error }) {
  const contenedorRef = useRef(null);

  useFocoEnCancelar(contenedorRef);

  return (
    <div ref={contenedorRef} className="zonas-form">
      {error && (
        <div role="alert" className="zonas-form__error-general">
          <Alert type="error" message={error} />
        </div>
      )}

      <p className="zonas-form__resumen">
        ¿Desactivar la zona <strong>{zona.nombre}</strong> ({zona.ciudad},{" "}
        {zona.departamento})? Los clientes con una dirección en esa ciudad no
        podrán calcular el envío (sin cobertura) hasta que la vuelvas a
        activar. Las tarifas se conservan.
      </p>

      <div className="zonas-form__acciones">
        <Button
          className="zonas-page__btn--peligro"
          text={procesando ? "Desactivando..." : "Desactivar zona"}
          onClick={() => onConfirmar(zona)}
          disabled={procesando}
        />
      </div>
    </div>
  );
}

// Confirmación previa a deshabilitar el contra entrega: además de sacar la
// opción del checkout, los pedidos contra entrega que ya existen en la zona y
// todavía no registraron su pago dejan de poder registrarlo.
function ConfirmarDeshabilitarContraEntrega({
  zona,
  onConfirmar,
  procesando,
  error,
}) {
  const contenedorRef = useRef(null);

  useFocoEnCancelar(contenedorRef);

  return (
    <div ref={contenedorRef} className="zonas-form">
      {error && (
        <div role="alert" className="zonas-form__error-general">
          <Alert type="error" message={error} />
        </div>
      )}

      <p className="zonas-form__resumen">
        ¿Deshabilitar el pago contra entrega en la zona{" "}
        <strong>{zona.nombre}</strong> ({zona.ciudad}, {zona.departamento})? Los
        clientes con una dirección en esa ciudad ya no podrán elegirlo al pagar,
        y los pedidos contra entrega de la zona que todavía no registraron su
        pago tampoco podrán registrarlo. Se puede volver a habilitar en
        cualquier momento.
      </p>

      <div className="zonas-form__acciones">
        <Button
          className="zonas-page__btn--peligro"
          text={procesando ? "Deshabilitando..." : "Deshabilitar contra entrega"}
          onClick={() => onConfirmar(zona)}
          disabled={procesando}
        />
      </div>
    </div>
  );
}

// Administración de zonas de cobertura y tarifas de envío (RF-026), solo
// admin. La tarjeta pide crear y ver; además se exponen cambiar tarifa y
// activar/desactivar porque RF-026 los exige y el backend (PUT .../tarifa y
// PATCH .../estado) ya los soporta. El contra entrega (RF-037) nace
// deshabilitado en cada zona: sin este control nadie podría pagar así.
function ZonasCobertura() {
  const {
    zonas,
    loading,
    error,
    errorAccion,
    procesando,
    recargar,
    crear,
    cambiarTarifa,
    cambiarEstado,
    cambiarContraEntrega,
    limpiarErrorAccion,
  } = useZonasCobertura();

  // { tipo: "crear" } | { tipo: "tarifa", zona } | { tipo: "desactivar", zona }
  // | { tipo: "deshabilitarContraEntrega", zona }
  const [modal, setModal] = useState(null);
  const [activandoId, setActivandoId] = useState(null);
  const [habilitandoId, setHabilitandoId] = useState(null);
  const [aviso, setAviso] = useState("");

  function abrirModal(nuevoModal) {
    limpiarErrorAccion();
    setAviso("");
    setModal(nuevoModal);
  }

  function cerrarModal() {
    // No se cierra mientras hay una mutación en curso: el resultado tiene
    // que poder mostrarse (o cerrar el modal) en el mismo lugar.
    if (procesando) return;

    limpiarErrorAccion();
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

  async function handleCrear(datos) {
    const resultado = await crear(datos);
    if (resultado.ok) setModal(null);
    return resultado;
  }

  async function handleCambiarTarifa(id, costo) {
    const resultado = await cambiarTarifa(id, costo);
    if (resultado.ok) setModal(null);
    return resultado;
  }

  async function handleDesactivar(zona) {
    const resultado = await cambiarEstado(zona.id, "INACTIVO");
    if (resultado.ok) setModal(null);
  }

  async function handleActivar(zona) {
    setAviso("");
    setActivandoId(zona.id);
    await cambiarEstado(zona.id, "ACTIVO");
    setActivandoId(null);
  }

  // El aviso se arma después de la mutación: el hook recarga la lista siempre,
  // así que solo se anuncia el éxito cuando el backend confirmó el cambio.
  async function handleHabilitarContraEntrega(zona) {
    setAviso("");
    setHabilitandoId(zona.id);
    const resultado = await cambiarContraEntrega(zona.id, true);
    setHabilitandoId(null);

    if (resultado.ok) {
      setAviso(`Pago contra entrega habilitado en la zona ${zona.nombre}.`);
    }
  }

  async function handleDeshabilitarContraEntrega(zona) {
    const resultado = await cambiarContraEntrega(zona.id, false);

    if (resultado.ok) {
      setModal(null);
      setAviso(`Pago contra entrega deshabilitado en la zona ${zona.nombre}.`);
    }
  }

  const columns = [
    { key: "departamento", label: "Departamento" },
    { key: "ciudad", label: "Ciudad" },
    { key: "nombre", label: "Zona" },
    {
      key: "tarifa",
      label: "Tarifa activa",
      render: (zona) =>
        zona.tarifaActiva ? (
          formatearCosto(zona.tarifaActiva.costo)
        ) : (
          <span className="zonas-page__sin-tarifa">Sin tarifa activa</span>
        ),
    },
    {
      key: "estado",
      label: "Estado",
      render: (zona) =>
        zona.estado === "ACTIVO" ? (
          <Badge text="Activa" type="success" />
        ) : (
          <Badge text="Inactiva" type="sale" />
        ),
    },
    {
      key: "contraEntrega",
      label: "Contra entrega",
      render: (zona) =>
        zona.permiteContraEntrega === true ? (
          <Badge text="Habilitado" type="success" />
        ) : (
          <Badge text="No habilitado" type="warning" />
        ),
    },
    {
      key: "acciones",
      label: "Acciones",
      render: (zona) => (
        <div className="zonas-page__acciones-fila">
          <Button
            className="zonas-page__btn--secundario"
            text="Cambiar tarifa"
            onClick={() => abrirModal({ tipo: "tarifa", zona })}
            disabled={procesando}
          />
          {zona.permiteContraEntrega === true ? (
            <Button
              className="zonas-page__btn--secundario"
              text="Deshabilitar contra entrega"
              ariaLabel={`Deshabilitar contra entrega en la zona ${zona.nombre}`}
              onClick={() =>
                abrirModal({ tipo: "deshabilitarContraEntrega", zona })
              }
              disabled={procesando}
            />
          ) : (
            <Button
              text={
                habilitandoId === zona.id
                  ? "Habilitando..."
                  : "Habilitar contra entrega"
              }
              ariaLabel={`Habilitar contra entrega en la zona ${zona.nombre}`}
              onClick={() => handleHabilitarContraEntrega(zona)}
              disabled={procesando}
            />
          )}
          {zona.estado === "ACTIVO" ? (
            <Button
              className="zonas-page__btn--peligro"
              text="Desactivar"
              onClick={() => abrirModal({ tipo: "desactivar", zona })}
              disabled={procesando}
            />
          ) : (
            <Button
              text={activandoId === zona.id ? "Activando..." : "Activar"}
              onClick={() => handleActivar(zona)}
              disabled={procesando}
            />
          )}
        </div>
      ),
    },
  ];

  const tituloModal = {
    crear: "Nueva zona de cobertura",
    tarifa: "Cambiar tarifa de envío",
    desactivar: "Desactivar zona",
    deshabilitarContraEntrega: "Deshabilitar contra entrega",
  };

  const hayError = Boolean(error);
  const mostrarTabla = !loading && (!hayError || zonas.length > 0);

  return (
    <div className="zonas-page">
      <div className="zonas-page__header">
        <h1>Zonas de cobertura y tarifas de envío</h1>
        <Button text="Nueva zona" onClick={() => abrirModal({ tipo: "crear" })} />
      </div>

      <div aria-live="polite">
        {aviso && (
          <Alert type="success" message={aviso} onClose={() => setAviso("")} />
        )}
        {errorAccion && !modal && <Alert type="error" message={errorAccion} />}
      </div>

      {hayError && !loading && (
        <div role="alert" className="zonas-page__error">
          <Alert type="error" message={error} />
          <Button text="Reintentar" onClick={recargar} />
        </div>
      )}

      {loading && <Loading text="Cargando zonas de cobertura..." />}

      {mostrarTabla && (
        <Table
          columns={columns}
          rows={zonas}
          emptyMessage="Todavía no hay zonas de cobertura. Creá la primera con «Nueva zona»."
        />
      )}

      <Modal
        isOpen={Boolean(modal)}
        onClose={cerrarModal}
        title={modal ? tituloModal[modal.tipo] : ""}
      >
        {modal?.tipo === "crear" && (
          <FormularioZona onGuardar={handleCrear} procesando={procesando} />
        )}

        {modal?.tipo === "tarifa" && (
          <FormularioTarifa
            zona={modal.zona}
            onGuardar={handleCambiarTarifa}
            procesando={procesando}
          />
        )}

        {modal?.tipo === "desactivar" && (
          <ConfirmarDesactivar
            zona={modal.zona}
            onConfirmar={handleDesactivar}
            procesando={procesando}
            error={errorAccion}
          />
        )}

        {modal?.tipo === "deshabilitarContraEntrega" && (
          <ConfirmarDeshabilitarContraEntrega
            zona={modal.zona}
            onConfirmar={handleDeshabilitarContraEntrega}
            procesando={procesando}
            error={errorAccion}
          />
        )}
      </Modal>
    </div>
  );
}

export default ZonasCobertura;
