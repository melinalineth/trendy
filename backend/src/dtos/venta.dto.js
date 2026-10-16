
const ESTADOS_VENTA = ["REGISTRADA", "ANULADA"];

const crearErrorValidacion = (detalles) => {
  const error = new Error("Datos inválidos");
  error.status = 400;
  error.codigo = "VALIDACION_FALLIDA";
  error.detalles = detalles;

  return error;
};

// Rechaza formatos incorrectos y fechas inexistentes del calendario.
const validarFechaCalendario = (valor, campo, detalles) => {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    detalles.push(`${campo} debe tener el formato YYYY-MM-DD.`);
    return null;
  }

  const [anio, mes, dia] = valor.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    detalles.push(`${campo} no es una fecha de calendario válida.`);
    return null;
  }

  return { anio, mes, dia, valor };
};

const validarFiltrosVentas = (query) => {
  const detalles = [];

  const campos = [
    "desde",
    "hasta",
    "estado",
    "pagina",
    "limite",
  ];

  // Express puede entregar arrays si un parámetro se repite.
  for (const campo of campos) {
    if (Array.isArray(query[campo])) {
      detalles.push(`El parámetro ${campo} no puede repetirse.`);
    }
  }

  if (detalles.length > 0) {
    throw crearErrorValidacion(detalles);
  }

  const desdeRaw = query.desde;
  const hastaRaw = query.hasta;
  const estadoRaw = query.estado;
  const paginaRaw = query.pagina;
  const limiteRaw = query.limite;

  let desde;
  let hastaExclusivo;

  let fechaDesde;
  let fechaHasta;

  if (desdeRaw !== undefined) {
    fechaDesde = validarFechaCalendario(
      desdeRaw,
      "desde",
      detalles
    );

    if (fechaDesde) {
      desde = new Date(`${desdeRaw}T00:00:00-05:00`);
    }
  }

  if (hastaRaw !== undefined) {
    fechaHasta = validarFechaCalendario(
      hastaRaw,
      "hasta",
      detalles
    );

    if (fechaHasta) {
      // El límite es exclusivo: medianoche de Bogotá del día siguiente.
      const siguienteDia = new Date(
        Date.UTC(
          fechaHasta.anio,
          fechaHasta.mes - 1,
          fechaHasta.dia + 1
        )
      );

      const anio = siguienteDia.getUTCFullYear();
      const mes = String(siguienteDia.getUTCMonth() + 1).padStart(2, "0");
      const dia = String(siguienteDia.getUTCDate()).padStart(2, "0");

      hastaExclusivo = new Date(
        `${anio}-${mes}-${dia}T00:00:00-05:00`
      );
    }
  }

  if (fechaDesde && fechaHasta) {
    const inicioUTC = Date.UTC(
      fechaDesde.anio,
      fechaDesde.mes - 1,
      fechaDesde.dia
    );

    const finUTC = Date.UTC(
      fechaHasta.anio,
      fechaHasta.mes - 1,
      fechaHasta.dia
    );

    if (inicioUTC > finUTC) {
      detalles.push("desde no puede ser posterior a hasta.");
    } else {
      const diasInclusivos =
        (finUTC - inicioUTC) / 86_400_000 + 1;

      if (diasInclusivos > 366) {
        detalles.push("El rango de fechas no puede superar 366 días.");
      }
    }
  }

  let estado;

  if (estadoRaw !== undefined) {
    if (!ESTADOS_VENTA.includes(estadoRaw)) {
      detalles.push(
        `estado debe ser uno de los siguientes valores: ${ESTADOS_VENTA.join(", ")}.`
      );
    } else {
      estado = estadoRaw;
    }
  }

  const validarEntero = (
    valor,
    campo,
    predeterminado,
    minimo,
    maximo
  ) => {
    if (valor === undefined) {
      return predeterminado;
    }

    if (!/^\d+$/.test(valor)) {
      detalles.push(`${campo} debe ser un número entero.`);
      return undefined;
    }

    const numero = Number(valor);

    if (
      !Number.isSafeInteger(numero) ||
      numero < minimo ||
      (maximo !== undefined && numero > maximo)
    ) {
      detalles.push(
        maximo === undefined
          ? `${campo} debe ser mayor o igual a ${minimo}.`
          : `${campo} debe estar entre ${minimo} y ${maximo}.`
      );
      return undefined;
    }

    return numero;
  };

  const pagina = validarEntero(
    paginaRaw,
    "pagina",
    1,
    1
  );

  const limite = validarEntero(
    limiteRaw,
    "limite",
    20,
    1,
    100
  );

  if (detalles.length > 0) {
    throw crearErrorValidacion(detalles);
  }

  return {
    desde,
    hastaExclusivo,
    estado,
    pagina,
    limite,
  };
};

module.exports = {
  validarFiltrosVentas,
};
