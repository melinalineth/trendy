
// Sprint 5 / RF-042: filtros de GET /api/v1/ventas. Contrato completo en
// docs/diseno/ventas-api.md. Borrador original de Valentina Linares; ajustado
// al contrato (código FILTROS_INVALIDOS, defaults, parámetros desconocidos,
// tope de página).
const ESTADOS_VENTA = ["REGISTRADA", "ANULADA"];
const CAMPOS_PERMITIDOS = ["desde", "hasta", "estado", "pagina", "limite"];
const LIMITE_POR_DEFECTO = 50;
const LIMITE_MAXIMO = 100;
// Tope de página: evita un OFFSET fuera del rango entero seguro de Prisma.
const PAGINA_MAXIMA = 100000;
// Años aceptados en desde/hasta: evita fechas absurdas (9999-12-31, 0100-01-01).
const ANIO_MINIMO = 2000;
const ANIO_MAXIMO = 2100;
// Bogotá es UTC-5 todo el año (sin horario de verano): su medianoche es 05:00Z.
const DESFASE_BOGOTA_HORAS = 5;

const crearErrorValidacion = (detalles) => {
  const error = new Error("Los filtros de consulta de ventas no son válidos");
  error.status = 400;
  error.codigo = "FILTROS_INVALIDOS";
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

  // Antes del calendario: Date.UTC trata los años 0..99 como 1900..1999.
  if (anio < ANIO_MINIMO || anio > ANIO_MAXIMO) {
    detalles.push(`${campo} debe estar entre los años ${ANIO_MINIMO} y ${ANIO_MAXIMO}.`);
    return null;
  }

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

  const desconocidos = Object.keys(query).filter(
    (campo) => !CAMPOS_PERMITIDOS.includes(campo)
  );

  if (desconocidos.length > 0) {
    detalles.push(`Parámetros no permitidos: ${desconocidos.join(", ")}.`);
  }

  // Express puede entregar arrays si un parámetro se repite: se informa y no
  // se vuelve a validar ese campo (para no duplicar el mensaje).
  const valorDe = (campo) => {
    if (Array.isArray(query[campo])) {
      detalles.push(`El parámetro ${campo} no puede repetirse.`);
      return undefined;
    }

    return query[campo];
  };

  const desdeRaw = valorDe("desde");
  const hastaRaw = valorDe("hasta");
  const estadoRaw = valorDe("estado");
  const paginaRaw = valorDe("pagina");
  const limiteRaw = valorDe("limite");

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
      desde = new Date(
        Date.UTC(fechaDesde.anio, fechaDesde.mes - 1, fechaDesde.dia, DESFASE_BOGOTA_HORAS)
      );
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
      // Date.UTC normaliza el desborde de día/mes/año (31/12 -> 01/01).
      hastaExclusivo = new Date(
        Date.UTC(
          fechaHasta.anio,
          fechaHasta.mes - 1,
          fechaHasta.dia + 1,
          DESFASE_BOGOTA_HORAS
        )
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

    if (typeof valor !== "string" || !/^\d+$/.test(valor)) {
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
    1,
    PAGINA_MAXIMA
  );

  const limite = validarEntero(
    limiteRaw,
    "limite",
    LIMITE_POR_DEFECTO,
    1,
    LIMITE_MAXIMO
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
  LIMITE_POR_DEFECTO,
  LIMITE_MAXIMO,
};
