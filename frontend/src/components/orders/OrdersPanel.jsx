import { useEffect, useRef, useState } from "react";

import Alert from "../common/Alert";
import Badge from "../common/Badge";
import Button from "../common/Button";
import Input from "../common/Input";
import Loading from "../common/Loading";
import Modal from "../common/Modal";
import Pagination from "../common/Pagination";
import Table from "../common/Table";
import { useGestionPedidos } from "../../hooks/useGestionPedidos";
import {
  ESTADOS_CANCELABLES_CONTRA_ENTREGA,
  ESTADOS_ENVIO,
  ESTADOS_PEDIDO,
  TRANSICIONES_PEDIDO,
  badgeEstadoPago,
  badgeEstadoPedido,
  describirVariante,
  etiquetaEstadoEnvio,
  etiquetaEstadoPago,
  etiquetaEstadoPedido,
  etiquetaMetodoPago,
  formatearFecha,
  formatearPrecio,
  sePuedeCancelar,
  textoUnidades,
} from "./pedidoEstados";
import "./OrdersPanel.css";

const LARGO_MAXIMO_NUMERO = 40; // mismo tope que el DTO del backend

function nombreCliente(pedido) {
  return pedido.usuario?.nombre || `Usuario #${pedido.usuarioId}`;
}

// Devuelve el mensaje de error de los filtros, o "" si son válidos (mismas
// reglas que listarPedidosSchema del backend, para no ir a buscar un 400).
function validarFiltros(filtros) {
  if (filtros.numero.trim().length > LARGO_MAXIMO_NUMERO) {
    return `El número de pedido no puede superar ${LARGO_MAXIMO_NUMERO} caracteres.`;
  }

  const usuarioId = filtros.usuarioId.trim();
  if (usuarioId && (!/^\d+$/.test(usuarioId) || Number(usuarioId) < 1)) {
    return "El ID del cliente debe ser un número entero mayor que cero.";
  }

  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
    return "La fecha «desde» no puede ser posterior a «hasta».";
  }

  return "";
}

// Acción de avance que corresponde al pedido según TRANSICIONES_PEDIDO (copia
// de la tabla del backend). Devuelve { tipo, destino } para el botón, o
// { nota } cuando hay un siguiente estado pero no se puede fijar a mano, o
// null si el estado es final.
//   - EN_PREPARACION / ENVIADO / EN_TRANSITO: se avanza el ENVÍO con PUT
//     /estado-envio (RF-029), que sincroniza también el estado del pedido.
//   - El resto (PENDIENTE, PAGO_APROBADO, CONFIRMADO): PATCH /estado.
function accionDeAvance(pedido) {
  const destino = TRANSICIONES_PEDIDO[pedido.estado]?.[0];
  if (!destino) return null;

  if (pedido.estado === "PENDIENTE") {
    if (pedido.metodoPago === "MERCADO_PAGO") {
      return {
        nota: "Un pedido de Mercado Pago se confirma solo, cuando Mercado Pago aprueba el pago.",
      };
    }

    const pagoRegistrado =
      pedido.pago?.metodo === "CONTRA_ENTREGA" &&
      ["PENDIENTE", "APROBADO"].includes(pedido.pago?.estado);

    if (!pagoRegistrado) {
      return {
        nota: "El cliente todavía no registró su pago contra entrega: el pedido no se puede confirmar hasta entonces.",
      };
    }
  }

  return {
    tipo: ESTADOS_ENVIO.includes(pedido.estado) ? "envio" : "avanzar",
    destino,
  };
}

// Por qué un pedido (que no está CANCELADO) no se puede cancelar; las mismas
// causas que el 409 del backend (cancelarBajoLock / mensajeNoCancelable).
function motivoNoCancelable(pedido) {
  if (pedido.estado === "ENTREGADO") {
    return "Un pedido ya entregado no se puede cancelar.";
  }

  if (pedido.pago?.estado === "APROBADO") {
    return "El pedido tiene un pago aprobado: no se puede cancelar desde el sistema (el reembolso se gestiona manualmente).";
  }

  if (pedido.metodoPago === "MERCADO_PAGO" && pedido.estado !== "PENDIENTE") {
    return "Un pedido de Mercado Pago ya pagado no se puede cancelar desde el sistema (el reembolso se gestiona manualmente).";
  }

  return "Solo se pueden cancelar los pedidos pendientes de pago y los contra entrega que todavía no se entregaron.";
}

// Texto de la fila «Envío» del detalle. Un pedido CANCELADO conserva su
// InfoEnvio (el paquete pudo haber salido): se muestra el estado real del
// envío aclarando que el pedido se canceló. EN_PREPARACION en un cancelado no
// dice nada (es el valor de arranque), solo que no salió de la tienda.
function textoEnvio(pedido) {
  const info = pedido.infoEnvio;

  if (pedido.estado === "CANCELADO") {
    if (!info || info.estadoEnvio === "EN_PREPARACION") {
      return "No salió de la tienda (pedido cancelado)";
    }

    return `${etiquetaEstadoEnvio(info.estadoEnvio)} (pedido cancelado)`;
  }

  if (ESTADOS_ENVIO.includes(pedido.estado) && info) {
    return `${etiquetaEstadoEnvio(info.estadoEnvio)} (actualizado ${formatearFecha(info.actualizadoEn)})`;
  }

  return "Todavía no empezó";
}

// Foco inicial en "Cancelar" (footer del Modal común) para que un Enter
// accidental no confirme una acción irreversible. Mismo criterio que
// ZonasCobertura.
function useFocoEnCancelar(ref) {
  useEffect(() => {
    ref.current
      ?.closest(".modal")
      ?.querySelector(".modal__button--cancel")
      ?.focus();
  }, [ref]);
}

function textoConfirmacion(confirmacion) {
  const { tipo, pedido, destino } = confirmacion;
  const numero = pedido?.numero ?? `#${pedido?.id}`;

  switch (tipo) {
    case "avanzar":
      return `¿Pasar el pedido ${numero} de «${etiquetaEstadoPedido(pedido.estado)}» a «${etiquetaEstadoPedido(destino)}»? Los cambios de estado no se pueden deshacer.`;
    case "envio":
      return `¿Marcar el envío del pedido ${numero} como «${etiquetaEstadoEnvio(destino)}»? El estado del pedido se actualiza junto con el envío y no se puede volver atrás.`;
    case "cobro":
      return `¿Registrar que se cobró ${formatearPrecio(pedido.total)} en efectivo por el pedido ${numero}? El pago quedará aprobado.`;
    case "cancelar": {
      const unidades = (pedido.detalles ?? []).reduce(
        (suma, linea) => suma + Number(linea.cantidad ?? 0),
        0,
      );
      const pagoContraEntrega =
        pedido.pago?.metodo === "CONTRA_ENTREGA" && pedido.pago?.estado === "PENDIENTE"
          ? " El pago contra entrega registrado también se cancela."
          : "";

      const reposicion =
        unidades === 1
          ? "La unidad reservada vuelve al stock y queda disponible para la venta."
          : `Las ${textoUnidades(unidades)} reservadas vuelven al stock y quedan disponibles para la venta.`;

      // Un contra entrega confirmado ya tenía venta registrada: se anula.
      const anulaVenta = ESTADOS_CANCELABLES_CONTRA_ENTREGA.includes(pedido.estado)
        ? " La venta registrada de este pedido se anula."
        : "";

      // Desde ENVIADO / EN_TRANSITO el backend asume que la mercadería vuelve,
      // pero puede no haber vuelto todavía.
      const yaSalio = ["ENVIADO", "EN_TRANSITO"].includes(pedido.estado)
        ? " Como el pedido ya salió de la tienda, el stock se repone aunque la mercadería todavía pueda no haber vuelto: confirmá que la recuperás."
        : "";

      return `¿Cancelar el pedido ${numero}? ${reposicion}${yaSalio}${anulaVenta}${pagoContraEntrega} Esta acción no se puede deshacer.`;
    }
    case "vencidos":
      return "Se cancelan los pedidos de Mercado Pago que siguen pendientes de pago después de su plazo de vigencia (configurado en el servidor) y su stock vuelve a estar disponible. Los pedidos contra entrega y los que tienen el pago aprobado no se tocan.";
    default:
      return "";
  }
}

const TITULOS_CONFIRMACION = {
  avanzar: "Cambiar estado del pedido",
  envio: "Actualizar estado del envío",
  cobro: "Registrar cobro contra entrega",
  cancelar: "Cancelar pedido",
  vencidos: "Cancelar pedidos vencidos",
};

const BOTONES_CONFIRMACION = {
  avanzar: "Sí, cambiar estado",
  envio: "Sí, actualizar envío",
  cobro: "Sí, registrar cobro",
  cancelar: "Sí, cancelar pedido",
  vencidos: "Sí, cancelar vencidos",
};

function ConfirmarAccion({ confirmacion, onConfirmar, procesando, error }) {
  const contenedorRef = useRef(null);
  const destructiva = ["cancelar", "vencidos"].includes(confirmacion.tipo);

  useFocoEnCancelar(contenedorRef);

  return (
    <div ref={contenedorRef} className="orders-panel__confirmacion">
      <div aria-live="polite">
        {error && <Alert type="error" message={error.mensaje} />}
      </div>

      <p>{textoConfirmacion(confirmacion)}</p>

      <div>
        <Button
          className={destructiva ? "orders-panel__btn--peligro" : ""}
          text={procesando ? "Procesando..." : BOTONES_CONFIRMACION[confirmacion.tipo]}
          onClick={onConfirmar}
          disabled={procesando}
        />
      </div>
    </div>
  );
}

function DetallePedido({ detalle, procesando, onVolver, onReintentar, onAccion }) {
  const tituloRef = useRef(null);

  // Al abrir el detalle el foco va a su título (la lista desaparece).
  useEffect(() => {
    tituloRef.current?.focus();
  }, [detalle.id]);

  const pedido = detalle.pedido;

  let contenido;

  if (!pedido && detalle.error) {
    contenido = (
      <div role="alert" className="orders-panel__error">
        <Alert
          type="error"
          message={
            detalle.error.status === 404
              ? "El pedido no existe."
              : detalle.error.mensaje
          }
        />
        <Button text="Reintentar" onClick={onReintentar} />
      </div>
    );
  } else if (!pedido) {
    contenido = <Loading text="Cargando pedido..." />;
  } else {
    const avance = accionDeAvance(pedido);
    const puedeCobrar =
      pedido.pago?.metodo === "CONTRA_ENTREGA" &&
      pedido.pago?.estado === "PENDIENTE" &&
      pedido.estado !== "CANCELADO";
    const puedeCancelar = sePuedeCancelar(pedido);
    const direccion = pedido.direccion;

    const columnasLineas = [
      {
        key: "producto",
        label: "Producto",
        render: (linea) => linea.variante?.producto?.nombre ?? "Producto",
      },
      {
        key: "variante",
        label: "Variante",
        render: (linea) => describirVariante(linea.variante),
      },
      { key: "sku", label: "SKU", render: (linea) => linea.variante?.sku ?? "—" },
      { key: "cantidad", label: "Cantidad" },
      {
        key: "precioUnitario",
        label: "Precio unitario",
        render: (linea) => formatearPrecio(linea.precioUnitario),
      },
      {
        key: "subtotal",
        label: "Subtotal",
        render: (linea) => formatearPrecio(linea.subtotal),
      },
    ];

    contenido = (
      <>
        {detalle.error && (
          <Alert
            type="warning"
            message="No pudimos actualizar el detalle: lo que ves puede no estar al día."
          />
        )}

        <div className="orders-panel__detalle-grid">
          <section className="orders-panel__card" aria-label="Datos del pedido">
            <dl className="orders-panel__datos">
              <div>
                <dt>Cliente</dt>
                <dd>
                  {nombreCliente(pedido)}
                  {pedido.usuario?.correo && (
                    <span className="orders-panel__muted">{pedido.usuario.correo}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Fecha</dt>
                <dd>{formatearFecha(pedido.creadoEn)}</dd>
              </div>
              <div>
                <dt>Método de pago</dt>
                <dd>{etiquetaMetodoPago(pedido.metodoPago)}</dd>
              </div>
              <div>
                <dt>Pago</dt>
                <dd>
                  {pedido.pago ? (
                    <Badge
                      text={`${etiquetaEstadoPago(pedido.pago.estado)} · ${formatearPrecio(pedido.pago.monto)}`}
                      type={badgeEstadoPago(pedido.pago.estado)}
                    />
                  ) : (
                    "Sin pago registrado"
                  )}
                </dd>
              </div>
              <div>
                <dt>Envío</dt>
                <dd>{textoEnvio(pedido)}</dd>
              </div>
            </dl>
          </section>

          <section className="orders-panel__card" aria-label="Dirección de entrega">
            <h3>Dirección de entrega</h3>
            {direccion ? (
              <address className="orders-panel__direccion">
                <strong>{direccion.destinatario}</strong>
                <span>{direccion.calle}</span>
                <span>
                  {[direccion.ciudad, direccion.departamento].filter(Boolean).join(", ")}
                </span>
                {direccion.referencia && <span>{direccion.referencia}</span>}
                {direccion.telefono && <span>Tel. {direccion.telefono}</span>}
              </address>
            ) : (
              <p className="orders-panel__muted">Dirección no disponible.</p>
            )}
          </section>
        </div>

        <section className="orders-panel__card" aria-label="Productos del pedido">
          <Table
            columns={columnasLineas}
            rows={pedido.detalles ?? []}
            emptyMessage="El pedido no tiene productos."
          />
          <dl className="orders-panel__totales">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatearPrecio(pedido.subtotal)}</dd>
            </div>
            <div>
              <dt>Envío</dt>
              <dd>{formatearPrecio(pedido.costoEnvio)}</dd>
            </div>
            <div className="orders-panel__total">
              <dt>Total</dt>
              <dd>{formatearPrecio(pedido.total)}</dd>
            </div>
          </dl>
        </section>

        <section className="orders-panel__card" aria-labelledby="orders-panel-acciones">
          <h3 id="orders-panel-acciones">Acciones</h3>

          {avance?.nota && <p className="orders-panel__muted">{avance.nota}</p>}

          <div className="orders-panel__acciones">
            {avance?.tipo && (
              <Button
                text={
                  avance.tipo === "envio"
                    ? `Marcar envío como «${etiquetaEstadoEnvio(avance.destino)}»`
                    : `Pasar a «${etiquetaEstadoPedido(avance.destino)}»`
                }
                onClick={() => onAccion({ tipo: avance.tipo, pedido, destino: avance.destino })}
                disabled={procesando}
              />
            )}

            {puedeCobrar && (
              <Button
                className="orders-panel__btn--secundario"
                text="Registrar cobro contra entrega"
                onClick={() => onAccion({ tipo: "cobro", pedido })}
                disabled={procesando}
              />
            )}

            {puedeCancelar && (
              <Button
                className="orders-panel__btn--peligro"
                text="Cancelar pedido"
                onClick={() => onAccion({ tipo: "cancelar", pedido })}
                disabled={procesando}
              />
            )}
          </div>

          {!avance?.tipo && !puedeCobrar && !puedeCancelar && !avance?.nota && (
            <p className="orders-panel__muted">
              No hay acciones disponibles para un pedido «{etiquetaEstadoPedido(pedido.estado)}».
            </p>
          )}

          {pedido.estado !== "CANCELADO" && !puedeCancelar && (
            <p className="orders-panel__muted">{motivoNoCancelable(pedido)}</p>
          )}
        </section>
      </>
    );
  }

  return (
    <section className="orders-panel__detalle" aria-labelledby="orders-panel-detalle-titulo">
      <div className="orders-panel__detalle-header">
        <Button
          className="orders-panel__btn--secundario"
          text="← Volver a la lista"
          onClick={onVolver}
        />
        <h2 id="orders-panel-detalle-titulo" ref={tituloRef} tabIndex={-1}>
          Pedido {pedido?.numero ?? `#${detalle.id}`}
        </h2>
        {pedido && (
          <Badge
            text={etiquetaEstadoPedido(pedido.estado)}
            type={badgeEstadoPedido(pedido.estado)}
          />
        )}
      </div>

      {contenido}
    </section>
  );
}

function mensajeExito(confirmacion, datos) {
  const { tipo, pedido, destino } = confirmacion;
  const numero = pedido?.numero ?? `#${pedido?.id}`;

  switch (tipo) {
    case "avanzar":
      return `Pedido ${numero}: ahora está «${etiquetaEstadoPedido(destino)}».`;
    case "envio":
      return `Pedido ${numero}: envío «${etiquetaEstadoEnvio(destino)}».`;
    case "cobro":
      return `Registramos el cobro contra entrega del pedido ${numero}.`;
    case "cancelar": {
      if (datos?.yaCancelado) return `El pedido ${numero} ya estaba cancelado.`;

      // Mismo criterio que el modal de confirmación: un contra entrega
      // confirmado tenía venta (se anula) y, desde ENVIADO / EN_TRANSITO, el
      // stock se repone en el sistema aunque la mercadería pueda no haber
      // vuelto todavía.
      const anulaVenta = ESTADOS_CANCELABLES_CONTRA_ENTREGA.includes(pedido?.estado);
      const yaSalio = ["ENVIADO", "EN_TRANSITO"].includes(pedido?.estado);

      const stock = yaSalio
        ? "El stock se repuso en el sistema, pero la mercadería puede no haber vuelto todavía."
        : "Su stock volvió a estar disponible.";

      return `Pedido ${numero} cancelado. ${stock}${anulaVenta ? " La venta quedó anulada." : ""}`;
    }
    case "vencidos": {
      const cancelados = datos?.cancelados ?? [];
      const omitidos = datos?.omitidos ?? [];
      const partes = [
        cancelados.length > 0
          ? `Se cancelaron ${cancelados.length} pedido(s) vencido(s) (IDs: ${cancelados.join(", ")}).`
          : "No había pedidos vencidos para cancelar.",
        omitidos.length > 0
          ? `${omitidos.length} se omitieron porque cambiaron mientras tanto o fallaron (IDs: ${omitidos.join(", ")}).`
          : "",
        datos?.corte
          ? `Criterio: creados antes del ${formatearFecha(datos.corte)} (vigencia de ${datos.horas} h).`
          : "",
      ];
      return partes.filter(Boolean).join(" ");
    }
    default:
      return "";
  }
}

// Gestión de pedidos compartida por /admin/pedidos y /vendedor/pedidos
// (RF-032, RF-029, RF-037): listado con filtros y paginación, detalle y las
// acciones válidas según el estado. Un vendedor ve y gestiona todos los
// pedidos: no existe un modelo de asignación pedido-vendedor (DDS §6.2,
// limitación documentada para v2.0).
//   - permitirCancelarVencidos: solo admin (POST /pedidos/vencidos/cancelar).
export default function OrdersPanel({ permitirCancelarVencidos = false }) {
  const {
    filtros,
    cambiarFiltro,
    aplicarFiltros,
    limpiarFiltros,
    pedidos,
    paginacion,
    pagina,
    cambiarPagina,
    loading,
    error,
    recargar,
    detalle,
    verDetalle,
    recargarDetalle,
    cerrarDetalle,
    procesando,
    errorAccion,
    limpiarErrorAccion,
    cambiarEstadoPedido,
    cambiarEstadoEnvio,
    cancelarPedido,
    confirmarRecepcion,
    cancelarVencidos,
  } = useGestionPedidos();

  const [errorFiltros, setErrorFiltros] = useState("");
  // { tipo: "avanzar" | "envio" | "cobro" | "cancelar" | "vencidos", pedido?, destino? }
  const [confirmacion, setConfirmacion] = useState(null);
  const [resultado, setResultado] = useState("");

  function abrirConfirmacion(nueva) {
    limpiarErrorAccion();
    setResultado("");
    setConfirmacion(nueva);
  }

  function cerrarConfirmacion() {
    // No se cierra con una acción en curso: su resultado se muestra acá.
    if (procesando) return;

    limpiarErrorAccion();
    setConfirmacion(null);
  }

  // Escape cierra el modal (el Modal común no lo maneja).
  useEffect(() => {
    if (!confirmacion) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") cerrarConfirmacion();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  async function confirmar() {
    if (!confirmacion) return;

    const { tipo, pedido, destino } = confirmacion;
    let respuesta;

    if (tipo === "avanzar") respuesta = await cambiarEstadoPedido(pedido.id, destino);
    else if (tipo === "envio") respuesta = await cambiarEstadoEnvio(pedido.id, destino);
    else if (tipo === "cobro") respuesta = await confirmarRecepcion(pedido.id);
    else if (tipo === "cancelar") respuesta = await cancelarPedido(pedido.id);
    else if (tipo === "vencidos") respuesta = await cancelarVencidos();

    if (!respuesta || respuesta.ignorado) return;

    if (respuesta.ok) {
      setResultado(mensajeExito(confirmacion, respuesta.datos));
      limpiarErrorAccion();
      setConfirmacion(null);
    }
    // Si falló, el modal queda abierto con el error (errorAccion).
  }

  function filtrar(event) {
    event.preventDefault();

    const mensaje = validarFiltros(filtros);
    setErrorFiltros(mensaje);
    if (mensaje) return;

    setResultado("");
    aplicarFiltros();
  }

  function limpiar() {
    setErrorFiltros("");
    setResultado("");
    limpiarFiltros();
  }

  function abrirDetalle(id) {
    setResultado("");
    verDetalle(id);
  }

  const columnas = [
    {
      key: "numero",
      label: "N.º pedido",
      render: (pedido) => pedido.numero ?? `#${pedido.id}`,
    },
    {
      key: "cliente",
      label: "Cliente",
      render: (pedido) => (
        <span className="orders-panel__cliente">
          {nombreCliente(pedido)}
          {pedido.usuario?.correo && (
            <span className="orders-panel__muted">{pedido.usuario.correo}</span>
          )}
        </span>
      ),
    },
    {
      key: "fecha",
      label: "Fecha",
      render: (pedido) => formatearFecha(pedido.creadoEn),
    },
    {
      key: "estado",
      label: "Estado",
      render: (pedido) => (
        <Badge
          text={etiquetaEstadoPedido(pedido.estado)}
          type={badgeEstadoPedido(pedido.estado)}
        />
      ),
    },
    {
      key: "metodoPago",
      label: "Pago",
      render: (pedido) => etiquetaMetodoPago(pedido.metodoPago),
    },
    {
      key: "total",
      label: "Total",
      render: (pedido) => formatearPrecio(pedido.total),
    },
    {
      key: "acciones",
      label: "Acciones",
      render: (pedido) => (
        <Button
          className="orders-panel__btn--secundario"
          text="Ver"
          onClick={() => abrirDetalle(pedido.id)}
        />
      ),
    },
  ];

  const totalPaginas = paginacion?.totalPaginas ?? 0;
  const mostrarTabla = !loading && (!error || pedidos.length > 0);

  return (
    <section className="orders-panel">
      <header className="orders-panel__header">
        <div>
          <h1>Gestión de pedidos</h1>
          <p>Consultá los pedidos y administrá su estado, envío y cobro.</p>
        </div>

        <div className="orders-panel__header-acciones">
          {permitirCancelarVencidos && (
            <Button
              className="orders-panel__btn--peligro"
              text="Cancelar pedidos vencidos"
              onClick={() => abrirConfirmacion({ tipo: "vencidos" })}
              disabled={procesando}
            />
          )}
          <Button
            className="orders-panel__btn--secundario"
            text={loading ? "Cargando..." : "Actualizar"}
            onClick={detalle ? recargarDetalle : recargar}
            disabled={loading}
          />
        </div>
      </header>

      <div className="orders-panel__avisos" aria-live="polite">
        {resultado && (
          <Alert type="success" message={resultado} onClose={() => setResultado("")} />
        )}
        {errorAccion && !confirmacion && (
          <Alert type="error" message={errorAccion.mensaje} onClose={limpiarErrorAccion} />
        )}
      </div>

      {detalle ? (
        <DetallePedido
          detalle={detalle}
          procesando={procesando}
          onVolver={cerrarDetalle}
          onReintentar={recargarDetalle}
          onAccion={abrirConfirmacion}
        />
      ) : (
        <>
          <form
            className="orders-panel__filtros"
            onSubmit={filtrar}
            noValidate
            aria-label="Filtros de pedidos"
          >
            <label className="orders-panel__campo">
              Número de pedido
              <Input
                type="search"
                name="numero"
                placeholder="ej. PED-1729"
                value={filtros.numero}
                onChange={(e) => cambiarFiltro("numero", e.target.value)}
              />
            </label>

            <label className="orders-panel__campo">
              Estado
              <select
                className="orders-panel__select"
                name="estado"
                value={filtros.estado}
                onChange={(e) => cambiarFiltro("estado", e.target.value)}
              >
                <option value="">Todos los estados</option>
                {ESTADOS_PEDIDO.map((estado) => (
                  <option key={estado} value={estado}>
                    {etiquetaEstadoPedido(estado)}
                  </option>
                ))}
              </select>
            </label>

            <label className="orders-panel__campo">
              ID del cliente
              <Input
                type="number"
                name="usuarioId"
                placeholder="ID de usuario"
                value={filtros.usuarioId}
                onChange={(e) => cambiarFiltro("usuarioId", e.target.value)}
              />
            </label>

            <label className="orders-panel__campo">
              Desde
              <Input
                type="date"
                name="desde"
                value={filtros.desde}
                onChange={(e) => cambiarFiltro("desde", e.target.value)}
              />
            </label>

            <label className="orders-panel__campo">
              Hasta
              <Input
                type="date"
                name="hasta"
                value={filtros.hasta}
                onChange={(e) => cambiarFiltro("hasta", e.target.value)}
              />
            </label>

            <div className="orders-panel__filtros-acciones">
              <Button type="submit" text="Filtrar" disabled={loading} />
              <Button
                className="orders-panel__btn--secundario"
                text="Limpiar filtros"
                onClick={limpiar}
                disabled={loading}
              />
            </div>
          </form>

          {errorFiltros && (
            <p role="alert" className="orders-panel__error-campo">
              {errorFiltros}
            </p>
          )}

          {error && !loading && (
            <div role="alert" className="orders-panel__error">
              <Alert type="error" message={error} />
              <Button text="Reintentar" onClick={recargar} />
            </div>
          )}

          {loading && <Loading text="Cargando pedidos..." />}

          {mostrarTabla && (
            <>
              <Table
                columns={columnas}
                rows={pedidos}
                emptyMessage="No se encontraron pedidos con los filtros seleccionados."
              />

              <p className="orders-panel__count">
                Pedidos encontrados: {paginacion?.total ?? pedidos.length}
              </p>

              {totalPaginas > 1 && (
                <nav className="orders-panel__paginacion" aria-label="Páginas de pedidos">
                  <Pagination
                    currentPage={pagina}
                    totalPages={totalPaginas}
                    onPageChange={cambiarPagina}
                  />
                </nav>
              )}
            </>
          )}
        </>
      )}

      <Modal
        isOpen={Boolean(confirmacion)}
        onClose={cerrarConfirmacion}
        title={confirmacion ? TITULOS_CONFIRMACION[confirmacion.tipo] : ""}
      >
        {confirmacion && (
          <ConfirmarAccion
            confirmacion={confirmacion}
            onConfirmar={confirmar}
            procesando={procesando}
            error={errorAccion}
          />
        )}
      </Modal>
    </section>
  );
}
