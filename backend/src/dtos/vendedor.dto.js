const { z } = require("zod");

// RF-007: el estado de un vendedor es el mismo enum EstadoUsuario del
// schema (ACTIVO/INACTIVO) — no existe un "estado de vendedor" separado del
// estado de Usuario a nivel de datos.
const cambiarEstadoSchema = z.object({
  estado: z.enum(["ACTIVO", "INACTIVO"], {
    error: "El estado debe ser ACTIVO o INACTIVO",
  }),
});

module.exports = {
  cambiarEstadoSchema,
};
