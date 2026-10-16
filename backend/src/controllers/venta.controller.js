const ventaService = require("../services/venta.service");
const { validarFiltrosVentas } = require("../dtos/venta.dto");

const listar = async (req, res) => {
  const filtros = validarFiltrosVentas(req.query);
  const resultado = await ventaService.consultar(filtros, req.usuario);

  return res.status(200).json(resultado);
};

module.exports = {
  listar,
};

const express = require("express");
const router = express.Router();

const pagoController = require("../controllers/pago.controller");
const auth = require("../middlewares/auth");
const roleGuard = require("../middlewares/roleGuard");

// Registrar pago contra entrega
router.post(
  "/contra-entrega",
  auth,
  pagoController.registrarContraEntrega
);

// Consultar el pago de un pedido
router.get(
  "/pedidos/:id/pago",
  auth,
  pagoController.obtenerPagoPorPedido
);