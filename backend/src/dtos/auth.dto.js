const { z } = require("zod");

// RF-001: nombre, correo, contraseña y aceptación de políticas son mínimos.
// aceptaPoliticas es un requisito de validación del request — no se persiste
// en DB (el modelo Usuario no tiene esa columna).
//
// Nota zod v4: `.min(1, "...")` solo aplica cuando el campo SÍ llega como
// string (ej: ""), no cuando falta directamente del body — ahí zod tira su
// propio "Invalid input: expected string, received undefined" antes de
// llegar al .min(). Por eso acá también se pasa el mensaje en
// `z.string({ error: "..." })`, igual que ya resuelve direccion.dto.js.
const registerSchema = z.object({
  nombre: z.string({ error: "El nombre es requerido" }).trim().min(1, "El nombre es requerido"),
  correo: z.string({ error: "El correo es requerido" }).trim().email("Formato de correo inválido"),
  password: z
    .string({ error: "La contraseña es requerida" })
    .min(8, "La contraseña debe tener al menos 8 caracteres"),
  aceptaPoliticas: z.literal(true, "Debe aceptar las políticas para continuar"),
});

const loginSchema = z.object({
  correo: z.string({ error: "El correo es requerido" }).trim().email("Formato de correo inválido"),
  password: z.string({ error: "La contraseña es requerida" }).min(1, "La contraseña es requerida"),
});

const recuperarPasswordSchema = z.object({
  correo: z.string({ error: "El correo es requerido" }).trim().email("Formato de correo inválido"),
});

const restablecerPasswordSchema = z.object({
  token: z.string({ error: "El token es requerido" }).min(1, "El token es requerido"),
  password: z
    .string({ error: "La contraseña es requerida" })
    .min(8, "La contraseña debe tener al menos 8 caracteres"),
});

module.exports = {
  registerSchema,
  loginSchema,
  recuperarPasswordSchema,
  restablecerPasswordSchema,
};
