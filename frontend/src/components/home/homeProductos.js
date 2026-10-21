// Helpers de datos de la página de inicio. Son los mismos criterios que ya usa
// Catalog.jsx (cada pantalla del proyecto trae sus propias copias locales de
// estos helpers; se mantienen iguales a propósito para que una tarjeta se vea
// idéntica en el inicio y en el catálogo).

export const IMAGEN_PLACEHOLDER = "/images/placeholder.jpg";

// `imagenes` puede llegar como array de strings o de objetos {url}. Devuelve
// null cuando el producto no tiene ninguna imagen.
export function urlImagen(producto) {
  const primera = producto.imagenes?.[0];

  if (!primera) return null;

  return typeof primera === "string" ? primera : primera.url || null;
}

// El backend serializa el precio (Decimal) como texto ("89900"): se convierte
// a número antes de darle formato. Si no es un número válido se muestra tal
// cual.
export function formatearPrecio(precio) {
  const numero = Number(precio);

  if (!Number.isFinite(numero)) return precio;

  return numero.toLocaleString("es-CO");
}

// Categorías para los selectores circulares del inicio.
//
// Se derivan de los productos activos que ya trae la lista pública (cada
// producto incluye su `categoria`) en vez de pedir /categorias: la tabla de
// categorías tiene registros heredados SIN productos (Remeras, Pantalones,
// Camperas, Calzado, Accesorios) que, mostrados acá, llevarían a un catálogo
// vacío. Así solo aparecen categorías que tienen al menos un producto a la
// venta. El orden es el de primera aparición. Cada categoría guarda hasta 3
// fotos candidatas (la primera imagen de sus primeros productos) para que, si
// una URL está rota, se pruebe la siguiente antes de caer a la inicial.
const FOTOS_POR_CATEGORIA = 3;

export function categoriasConProductos(productos) {
  const porId = new Map();

  for (const producto of productos) {
    const categoria = producto.categoria;

    // Sin nombre no hay chip que mostrar (ni nombre accesible para el enlace).
    if (!categoria || !categoria.nombre) continue;

    if (!porId.has(categoria.id)) {
      porId.set(categoria.id, {
        id: categoria.id,
        nombre: categoria.nombre,
        imagenes: [],
      });
    }

    const imagenes = porId.get(categoria.id).imagenes;
    const imagen = urlImagen(producto);

    if (imagen && imagenes.length < FOTOS_POR_CATEGORIA) imagenes.push(imagen);
  }

  return [...porId.values()];
}
