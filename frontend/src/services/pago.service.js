
import axios from "axios";

const API_URL = "/api/v1";

export async function crearPreferencia(pedidoId) {
  const respuesta = await axios.post(
    `${API_URL}/pagos/mercadopago/preferencia`,
    { pedidoId }
  );

  const datos = respuesta.data?.datos ?? respuesta.data;
  const urlCheckout =
    datos?.init_point ??
    datos?.checkoutUrl ??
    datos?.url;

  if (!urlCheckout) {
    throw new Error("No se recibió la URL de pago de Mercado Pago.");
  }

  return urlCheckout;
}

export async function pagarContraEntrega(pedidoId) {
  const respuesta = await axios.post(
    `${API_URL}/pagos/contra-entrega`,
    { pedidoId }
  );

  return respuesta.data?.datos ?? respuesta.data;
}

export async function consultarEstado(pedidoId) {
  const respuesta = await axios.get(
    `${API_URL}/pedidos/${encodeURIComponent(pedidoId)}/pago`
  );

  return respuesta.data?.datos ?? respuesta.data;
}

const pagoService = {
  crearPreferencia,
  pagarContraEntrega,
  consultarEstado,
};

export default pagoService;
