// Entradas del menú de usuario del Header, definidas como datos (un arreglo
// por rol) para que sumar una pantalla nueva sea agregar UNA línea acá.
//
// Regla: solo van rutas que existen en router/AppRouter.jsx. Si una ruta se
// agrega al router, recién ahí se agrega su entrada.
//
// Esta misma lista alimenta el menú lateral del personal (PersonalSidebar): la
// pantalla nueva se agrega UNA vez y el menú lateral la muestra. Los roles que
// tienen menú lateral (ROLES_CON_MENU_LATERAL) navegan desde ahí y su menú de
// usuario del Header queda solo con «Cerrar sesión» (ver entradasMenuUsuario).

// Roles con menú lateral (PersonalLayout en router/AppRouter.jsx). Si otro rol
// gana menú lateral, se agrega acá UNA línea y su menú de usuario deja de
// repetir las entradas.
export const ROLES_CON_MENU_LATERAL = ["admin", "vendedor"];

// `soloMenuUsuario`: la entrada va en el menú de usuario del Header pero NO en
// el menú lateral (que tiene su propio enlace «Ver la tienda»).
const CATALOGO = {
  etiqueta: "Catálogo",
  ruta: "/catalogo",
  soloMenuUsuario: true,
};

// Visitante (sin sesión).
export const ENTRADAS_VISITANTE = [
  { etiqueta: "Iniciar sesión", ruta: "/login" },
  { etiqueta: "Crear cuenta", ruta: "/registro" },
];

// Entradas por nombre de rol (`usuario.rol.nombre`).
export const ENTRADAS_POR_ROL = {
  cliente: [
    { etiqueta: "Mis pedidos", ruta: "/pedidos" },
    { etiqueta: "Mis direcciones", ruta: "/direcciones" },
    { etiqueta: "Mi carrito", ruta: "/carrito" },
    CATALOGO,
  ],
  vendedor: [
    { etiqueta: "Panel de inicio", ruta: "/vendedor" },
    { etiqueta: "Productos", ruta: "/vendedor/productos" },
    { etiqueta: "Inventario", ruta: "/vendedor/inventario" },
    { etiqueta: "Pedidos", ruta: "/vendedor/pedidos" },
    { etiqueta: "Ventas", ruta: "/vendedor/ventas" },
    CATALOGO,
  ],
  admin: [
    { etiqueta: "Panel de inicio", ruta: "/admin", icono: "panel" },
    { etiqueta: "Productos", ruta: "/admin/productos", icono: "productos" },
    { etiqueta: "Inventario", ruta: "/admin/inventario", icono: "inventario" },
    { etiqueta: "Pedidos", ruta: "/admin/pedidos", icono: "pedidos" },
    { etiqueta: "Ventas", ruta: "/admin/ventas", icono: "ventas" },
    { etiqueta: "Envíos y zonas", ruta: "/admin/envios", icono: "envios" },
    { etiqueta: "Vendedores", ruta: "/admin/vendedores", icono: "vendedores" },
    { etiqueta: "Usuarios", ruta: "/admin/usuarios", icono: "usuarios" },
    { etiqueta: "Roles", ruta: "/admin/roles", icono: "roles" },
    CATALOGO,
  ],
};

// Entradas de un rol SIN el acceso al catálogo: son las pantallas del panel
// (las que muestra el menú lateral de PersonalSidebar). Sale de la misma lista que
// el menú de usuario, así los dos nunca se desalinean. El `icono` (opcional)
// es el nombre de un ícono de IconoMenu.
// `rol` puede venir de localStorage: Object.hasOwn evita que un rol como
// "constructor" devuelva una propiedad heredada del objeto (igual que UserMenu).
export function entradasDePanel(rol) {
  if (typeof rol !== "string" || !Object.hasOwn(ENTRADAS_POR_ROL, rol)) {
    return [];
  }
  return ENTRADAS_POR_ROL[rol].filter((entrada) => !entrada.soloMenuUsuario);
}

// Entradas de navegación del menú de usuario del Header para un rol. Los roles
// con menú lateral no repiten ahí sus pantallas: devuelve [] y el menú muestra
// solo la identidad y «Cerrar sesión». Cliente (y cualquier rol sin menú
// lateral) conserva todas sus entradas. Un rol desconocido (p. ej. "constructor"
// leído de localStorage) devuelve [] igual que antes.
export function entradasMenuUsuario(rol) {
  if (typeof rol !== "string" || !Object.hasOwn(ENTRADAS_POR_ROL, rol)) {
    return [];
  }
  if (ROLES_CON_MENU_LATERAL.includes(rol)) return [];
  return ENTRADAS_POR_ROL[rol];
}

// Cómo se muestra el rol debajo del nombre.
export const ETIQUETA_ROL = {
  cliente: "Cliente",
  vendedor: "Vendedor",
  admin: "Administrador",
};
