import ProductsPanel from "../../components/products/ProductsPanel";

// Wrapper de ruta: la implementación real vive en ProductsPanel (compartida
// con /vendedor/productos) — mismo patrón que Sellers/Users/Roles.
function Products() {
  return <ProductsPanel />;
}

export default Products;
