
export async function listarTodos({ estado, numero, usuarioId } = {}) {
  const params = {};

  if (estado) params.estado = estado;
  if (numero) params.numero = numero;
  if (usuarioId) params.usuarioId = usuarioId;

  const respuesta = await axios.get(API_URL, { params });
  return respuesta.data;
}

export async function actualizarEstado(id, estado) {
  const respuesta = await axios.patch(
    `${API_URL}/${encodeURIComponent(id)}/estado`,
    { estado }
  );

  return respuesta.data;
}
