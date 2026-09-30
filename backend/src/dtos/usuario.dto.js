// RF-045: mismo contrato de cambio de estado que RF-007 (vendedor.dto.js) —
// el enum EstadoUsuario es único a nivel de schema, no hay un "estado de
// vendedor" distinto de un "estado de usuario". Se reusa el schema en vez
// de duplicarlo para que ambos no puedan divergir si el enum cambia (ej: se
// agrega un tercer estado) sin que alguien se acuerde de actualizar los dos
// archivos. La diferencia entre RF-007 y RF-045 no está en el DTO — está en
// el service: vendedor.service valida que el usuario objetivo sea
// "vendedor", usuario.service no restringe por rol.
const { cambiarEstadoSchema } = require("./vendedor.dto");

module.exports = {
  cambiarEstadoSchema,
};
