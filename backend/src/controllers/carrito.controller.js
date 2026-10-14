const carritoService = require("../services/carrito.service");
const { validarDireccionId } = require("../dtos/envio.dto");

// Controller delgado: toma el usuario del JWT y delega en el service. Los
// errores (validación, stock, cobertura, ítem ajeno) se propagan con throw —
// Express 5 reenvía las rejections async a errorHandler.js, que los traduce a
// { error: { codigo, mensaje, detalles } } (DDS §5.3).
//
// RN-003: el usuarioId sale SIEMPRE de req.usuario (seteado por auth.js a
// partir del JWT), nunca del body/params/query.

const obtenerCarrito = async (req, res) => {
  const carrito = await carritoService.obtenerCarrito(req.usuario.id);

  return res.status(200).json(carrito);
};

const agregarItem = async (req, res) => {
  const item = await carritoService.agregarItem(req.usuario.id, req.body);

  return res.status(201).json(item);
};

const modificarItem = async (req, res) => {
  const itemId = Number(req.params.id);
  const { cantidad } = req.body ?? {};

  const resultado = await carritoService.modificarItem(
    req.usuario.id,
    itemId,
    cantidad
  );

  return res.status(200).json(resultado);
};

const eliminarItem = async (req, res) => {
  const itemId = Number(req.params.id);

  const resultado = await carritoService.eliminarItem(req.usuario.id, itemId);

  return res.status(200).json(resultado);
};

// direccionId es opcional: sin él devuelve subtotal y total sin envío.
const resumen = async (req, res) => {
  const direccionId = validarDireccionId(req.query.direccionId, {
    obligatorio: false,
  });

  const resultado = await carritoService.resumen(req.usuario.id, direccionId);

  return res.status(200).json(resultado);
};

module.exports = {
  obtenerCarrito,
  agregarItem,
  modificarItem,
  eliminarItem,
  resumen,
};
