import { useState } from "react";

import Input from "../common/Input";
import Button from "../common/Button";
import Alert from "../common/Alert";
import varianteService from "../../services/variante.service";
import "./FormularioVariantes.css";

const FORM_VACIO = { sku: "", talla: "", color: "", stock: "" };

// El error 409 puede venir en dos formas distintas según qué controller lo
// arme: el envelope genérico { error: { mensaje } } de errorHandler.js, o un
// { error: "..." } plano como el que usa direccion.controller.js. Se prueban
// ambas formas antes de caer en un mensaje propio, porque el backend de esta
// ronda lo construye un agente en paralelo y el shape exacto puede variar.
function obtenerMensajeConflicto(err) {
  const data = err.response?.data;

  if (typeof data?.error === "string") return data.error;
  if (data?.error?.mensaje) return data.error.mensaje;
  if (data?.mensaje) return data.mensaje;

  // Fallback: RF-016 exige sku único (global) y talla/color único por
  // producto (ver @@unique en schema.prisma, modelo Variante) — el 409 es
  // por uno de esos dos motivos.
  return "Ya existe una variante con ese SKU, o con esa combinación de talla y color, para este producto.";
}

// Lista editable de variantes de un producto (RF-016). Cada variante se
// crea con su propio POST (el contrato no tiene un endpoint de alta en
// lote), así que "agregar variante" dispara una request inmediata en vez de
// acumular filas para enviar todas juntas.
function FormularioVariantes({ productoId, variantesIniciales = [] }) {
  const [variantes, setVariantes] = useState(variantesIniciales);
  const [form, setForm] = useState(FORM_VACIO);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  function handleChange(campo) {
    return (event) => setForm((prev) => ({ ...prev, [campo]: event.target.value }));
  }

  async function handleAgregar(event) {
    event.preventDefault();
    setError("");

    const sku = form.sku.trim();
    const talla = form.talla.trim();
    const color = form.color.trim();
    const stockNumerico = Number(form.stock);

    if (!sku || !talla || form.stock === "") {
      setError("SKU, talla y stock son obligatorios.");
      return;
    }

    if (!Number.isFinite(stockNumerico) || stockNumerico < 0) {
      setError("El stock debe ser un número mayor o igual a 0.");
      return;
    }

    setGuardando(true);

    try {
      const nuevaVariante = await varianteService.crearVariante(productoId, {
        sku,
        talla,
        color: color || undefined,
        stock: stockNumerico,
      });

      setVariantes((prev) => [...prev, nuevaVariante]);
      setForm(FORM_VACIO);
    } catch (err) {
      if (err.response?.status === 409) {
        setError(obtenerMensajeConflicto(err));
      } else {
        setError("No pudimos agregar la variante. Intentá de nuevo.");
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="formulario-variantes">
      <h3 className="formulario-variantes__titulo">Variantes (talla, color y stock)</h3>

      {error && <Alert type="error" message={error} />}

      <ul className="formulario-variantes__lista">
        {variantes.length === 0 && (
          <li className="formulario-variantes__vacio">
            Todavía no hay variantes cargadas.
          </li>
        )}

        {variantes.map((variante, index) => (
          <li key={variante.id ?? index} className="formulario-variantes__item">
            <span className="formulario-variantes__sku">{variante.sku}</span>
            <span>{variante.talla}</span>
            <span>{variante.color || "—"}</span>
            <span>{variante.stock} u.</span>
          </li>
        ))}
      </ul>

      <form className="formulario-variantes__form" onSubmit={handleAgregar}>
        <Input
          name="variante-sku"
          placeholder="SKU"
          value={form.sku}
          onChange={handleChange("sku")}
        />
        <Input
          name="variante-talla"
          placeholder="Talla"
          value={form.talla}
          onChange={handleChange("talla")}
        />
        <Input
          name="variante-color"
          placeholder="Color (opcional)"
          value={form.color}
          onChange={handleChange("color")}
        />
        <Input
          type="number"
          name="variante-stock"
          placeholder="Stock"
          value={form.stock}
          onChange={handleChange("stock")}
        />

        <Button
          type="submit"
          text={guardando ? "Agregando..." : "Agregar variante"}
          disabled={guardando}
        />
      </form>
    </div>
  );
}

export default FormularioVariantes;
