
import axios from "axios";

const API_URL = "/api/v1/pedidos";

export async function crearPedido({ direccionId, metodoPago }) {
  const respuesta = await axios.post(API_URL, {
    direccionId,
    metodoPago,
  });

  return respuesta.data;
}

export async function listarPropios() {
  const respuesta = await axios.get(API_URL);
  return respuesta.data;
}

export async function obtenerPorId(id) {
  const respuesta = await axios.get(
    `${API_URL}/${encodeURIComponent(id)}`
  );

  return respuesta.data;
}

export async function obtenerSeguimiento(id) {
  const respuesta = await axios.get(
    `${API_URL}/${encodeURIComponent(id)}/seguimiento`
  );

  return respuesta.data;
}

const pedidoService = {
  crearPedido,
  listarPropios,
  obtenerPorId,
  obtenerSeguimiento,
};

export default pedidoService;
