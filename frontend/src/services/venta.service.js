
import api from "./apiClient";

export const listarVentas = ({
  desde,
  hasta,
  estado,
  pagina,
  limite,
} = {}) => {
  const parametros = {
    desde,
    hasta,
    estado,
    pagina,
    limite,
  };

  const params = Object.fromEntries(
    Object.entries(parametros).filter(
      ([, valor]) => valor !== "" && valor !== null && valor !== undefined
    )
  );

  return api
    .get("/ventas", { params })
    .then((response) => response.data);
};

const ventaService = {
  listarVentas,
};

export default ventaService;
