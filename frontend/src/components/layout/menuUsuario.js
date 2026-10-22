// Entradas del menú de usuario del Header, definidas como datos (un arreglo
// por rol) para que sumar una pantalla nueva sea agregar UNA línea acá.
//
// Regla: solo van rutas que existen en router/AppRouter.jsx. Si una ruta se
// agrega al router, recién ahí se agrega su entrada.
//
// Esta misma lista alimenta el menú lateral del admin (AdminSidebar): la
// pantalla nueva se agrega UNA vez y aparece en los dos menús.

const CATALOGO = { etiqueta: "Catálogo", ruta: "/catalogo" };

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
// (las que muestra el menú lateral de AdminSidebar). Sale de la misma lista que
// el menú de usuario, así los dos nunca se desalinean. El `icono` (opcional)
// es el nombre de un ícono de AdminSidebar.
export function entradasDePanel(rol) {
  return (ENTRADAS_POR_ROL[rol] ?? []).filter((entrada) => entrada !== CATALOGO);
}

// Cómo se muestra el rol debajo del nombre.
export const ETIQUETA_ROL = {
  cliente: "Cliente",
  vendedor: "Vendedor",
  admin: "Administrador",
};
