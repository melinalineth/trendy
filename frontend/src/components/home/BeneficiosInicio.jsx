// Tira de 3 beneficios. El texto describe solo lo que la app hace hoy: el
// envío a domicilio y el pago contra entrega existen únicamente en las zonas
// de cobertura habilitadas por el administrador. No se promete cobertura
// nacional ni pagos "seguros".
const ICONO_PROPS = {
  width: 28,
  height: 28,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false",
};

const BENEFICIOS = [
  {
    titulo: "Envío a domicilio",
    texto: "En las ciudades con cobertura",
    icono: (
      <svg {...ICONO_PROPS}>
        <path d="M2 6h11v10H2z" />
        <path d="M13 9h4l3 3v4h-7z" />
        <circle cx="6.5" cy="17.5" r="1.8" />
        <circle cx="16.5" cy="17.5" r="1.8" />
      </svg>
    ),
  },
  {
    titulo: "Pago contra entrega",
    texto: "Disponible en las zonas habilitadas",
    icono: (
      <svg {...ICONO_PROPS}>
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6 9.5v.01M18 14.5v.01" />
      </svg>
    ),
  },
  {
    titulo: "Moda actual",
    texto: "Prendas para todos los días",
    icono: (
      <svg {...ICONO_PROPS}>
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
        <path d="M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" />
      </svg>
    ),
  },
];

function BeneficiosInicio() {
  return (
    <section className="home-beneficios" aria-label="Beneficios de comprar en Trendy">
      <ul className="home-beneficios__lista">
        {BENEFICIOS.map((beneficio) => (
          <li key={beneficio.titulo} className="home-beneficio">
            <span className="home-beneficio__icono">{beneficio.icono}</span>

            <div>
              <p className="home-beneficio__titulo">{beneficio.titulo}</p>
              <p className="home-beneficio__texto">{beneficio.texto}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default BeneficiosInicio;
