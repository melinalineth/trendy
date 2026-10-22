// Entradas del menú de usuario del Header, definidas como datos (un arreglo
// por rol) para que sumar una pantalla nueva sea agregar UNA línea acá.
//
// Regla: solo van rutas que existen en router/AppRouter.jsx. Si una ruta se
// agrega al router, recién ahí se agrega su entrada.

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
    { etiqueta: "Panel de inicio", ruta: "/admin" },
    { etiqueta: "Productos", ruta: "/admin/productos" },
    { etiqueta: "Inventario", ruta: "/admin/inventario" },
    { etiqueta: "Pedidos", ruta: "/admin/pedidos" },
    { etiqueta: "Ventas", ruta: "/admin/ventas" },
    { etiqueta: "Envíos y zonas", ruta: "/admin/envios" },
    { etiqueta: "Vendedores", ruta: "/admin/vendedores" },
    { etiqueta: "Usuarios", ruta: "/admin/usuarios" },
    { etiqueta: "Roles", ruta: "/admin/roles" },
    CATALOGO,
  ],
};

// Cómo se muestra el rol debajo del nombre.
export const ETIQUETA_ROL = {
  cliente: "Cliente",
  vendedor: "Vendedor",
  admin: "Administrador",
};
