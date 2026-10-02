import ProductsPanel from "../../components/products/ProductsPanel";

// Wrapper de ruta: la implementación real vive en ProductsPanel (compartida
// con /admin/productos). El backend no filtra productos por vendedor
// todavía, así que este panel muestra el mismo listado completo que ve
// admin — ver nota en ProductsPanel.jsx.
function Products() {
  return <ProductsPanel />;
}

export default Products;
