import { useState } from "react";

import Select from "../common/Select";
import Input from "../common/Input";
import Button from "../common/Button";
import Alert from "../common/Alert";
import inventarioService from "../../services/inventario.service";
import "./FormularioAjusteStock.css";

const TIPOS_AJUSTE = [
  { value: "ENTRADA", label: "Entrada (ingreso de stock)" },
  { value: "SALIDA", label: "Salida (retiro de stock)" },
  { value: "AJUSTE", label: "Ajuste manual (corrección)" },
];

const MENSAJE_ERROR_GENERICO =
  "No pudimos registrar el ajuste. Intentá de nuevo.";

// Criterio de modelado de `cantidad` en este formulario (el contrato de API
// solo dice "cantidad: number, puede ser negativa"): en ENTRADA y SALIDA el
// usuario carga una magnitud positiva ("cuántas unidades entran/salen"),
// porque nadie piensa "salida de -5 unidades" — es más natural pedir un
// número positivo y que el formulario le ponga el signo antes de mandarlo al
// backend (positivo para ENTRADA, negativo para SALIDA). En AJUSTE, en
// cambio, no hay una dirección implícita en la palabra "ajuste" (puede ser
// para arriba o para abajo), así que ahí el campo acepta el signo
// directamente tal cual lo escribe el usuario (ej. "-3" o "5") y se manda
// sin transformar.
function obtenerMensajeConflicto(err) {
  const data = err.response?.data;

  if (typeof data?.error === "string") return data.error;
  if (data?.error?.mensaje) return data.error.mensaje;
  if (data?.mensaje) return data.mensaje;

  // Fallback: el 409 de este endpoint es siempre por el mismo motivo (ver
  // contrato: "409 si el ajuste dejaría el stock negativo").
  return "Ese ajuste dejaría el stock en negativo. Verificá la cantidad e intentá de nuevo.";
}

function etiquetaCantidad(tipoAjuste) {
  if (tipoAjuste === "ENTRADA") return "Cantidad a ingresar";
  if (tipoAjuste === "SALIDA") return "Cantidad a retirar";
  return "Cantidad (usá signo negativo para restar)";
}

// Formulario de alta de un movimiento de stock (RF-017), pensado para vivir
// dentro de un Modal abierto desde la fila de InventarioPanel — mismo
// patrón de "sin botón cancelar propio" que FormularioProducto, porque el
// Modal común ya trae el suyo en el footer.
function FormularioAjusteStock({ varianteId, onGuardado }) {
  const [tipoAjuste, setTipoAjuste] = useState("ENTRADA");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const cantidadNumerica = Number(cantidad);

    if (cantidad.trim() === "" || !Number.isFinite(cantidadNumerica)) {
      setError("La cantidad es obligatoria y debe ser un número.");
      return;
    }

    if (tipoAjuste !== "AJUSTE" && cantidadNumerica <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }

    if (tipoAjuste === "AJUSTE" && cantidadNumerica === 0) {
      setError("La cantidad no puede ser 0.");
      return;
    }

    // Motivo obligatorio SOLO para AJUSTE (validación en cliente, como pide
    // el contrato) — ENTRADA/SALIDA no lo necesitan porque el tipo ya
    // explica el movimiento.
    if (tipoAjuste === "AJUSTE" && !motivo.trim()) {
      setError("El motivo es obligatorio para un ajuste manual.");
      return;
    }

    const cantidadFinal =
      tipoAjuste === "SALIDA" ? -Math.abs(cantidadNumerica) : cantidadNumerica;

    setGuardando(true);

    try {
      const movimiento = await inventarioService.registrarAjuste({
        varianteId,
        cantidad: cantidadFinal,
        tipoAjuste,
        // Se manda igual si el usuario cargó algo en ENTRADA/SALIDA (ahí es
        // opcional); en AJUSTE ya se validó arriba que no esté vacío.
        ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
      });

      setCantidad("");
      setMotivo("");
      onGuardado?.(movimiento);
    } catch (err) {
      if (err.response?.status === 409) {
        setError(obtenerMensajeConflicto(err));
      } else {
        setError(MENSAJE_ERROR_GENERICO);
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="formulario-ajuste-stock" onSubmit={handleSubmit}>
      {error && <Alert type="error" message={error} />}

      <Select
        label="Tipo de ajuste"
        name="tipoAjuste"
        value={tipoAjuste}
        onChange={(event) => setTipoAjuste(event.target.value)}
        options={TIPOS_AJUSTE}
        required
      />

      <label className="formulario-ajuste-stock__campo">
        {etiquetaCantidad(tipoAjuste)}
        <Input
          type="number"
          name="cantidad"
          placeholder={tipoAjuste === "AJUSTE" ? "ej. -3 o 5" : "0"}
          value={cantidad}
          onChange={(event) => setCantidad(event.target.value)}
        />
      </label>

      <label className="formulario-ajuste-stock__campo">
        Motivo{tipoAjuste === "AJUSTE" ? "" : " (opcional)"}
        <textarea
          className="formulario-ajuste-stock__textarea"
          name="motivo"
          placeholder={
            tipoAjuste === "AJUSTE"
              ? "Explicá por qué se corrige el stock (obligatorio)"
              : "Detalle adicional (opcional)"
          }
          value={motivo}
          onChange={(event) => setMotivo(event.target.value)}
        />
      </label>

      <div className="formulario-ajuste-stock__acciones">
        <Button
          type="submit"
          text={guardando ? "Guardando..." : "Registrar ajuste"}
          disabled={guardando}
        />
      </div>
    </form>
  );
}

export default FormularioAjusteStock;
