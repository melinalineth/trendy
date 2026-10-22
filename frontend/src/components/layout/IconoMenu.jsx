// Íconos de línea (24x24, trazo = color del texto) del menú lateral. Son
// decorativos: el texto de cada entrada ya dice a dónde lleva, por eso van con
// aria-hidden. El `nombre` es el campo `icono` de las entradas de
// menuUsuario.js; un nombre desconocido no dibuja nada (la entrada igual se
// ve y funciona).
const TRAZOS = {
  panel: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),
  productos: (
    <>
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </>
  ),
  inventario: (
    <>
      <path d="M3 3h18v4H3z" />
      <path d="M5 7v13h14V7M9.5 11.5h5" />
    </>
  ),
  pedidos: (
    <>
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <path d="M3 6h18M16 10a4 4 0 01-8 0" />
    </>
  ),
  ventas: (
    <>
      <path d="M22 7l-8.5 8.5-5-5L2 17" />
      <path d="M16 7h6v6" />
    </>
  ),
  envios: (
    <>
      <path d="M1 3h15v13H1z" />
      <path d="M16 8h4l3 3v5h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </>
  ),
  vendedores: (
    <>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </>
  ),
  usuarios: (
    <>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  roles: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  tienda: (
    <>
      <path d="M3 9l1-5h16l1 5M3 9v11h18V9" />
      <path d="M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0M9 20v-6h6v6" />
    </>
  ),
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  flecha: <path d="M6 9l6 6 6-6" />,
};

function IconoMenu({ nombre, className }) {
  const trazos = TRAZOS[nombre];
  if (!trazos) return null;

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {trazos}
    </svg>
  );
}

export default IconoMenu;
