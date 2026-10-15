import OrdersPanel from "../../components/orders/OrdersPanel";

// Wrapper de ruta: la implementación vive en OrdersPanel (compartida con
// /admin/pedidos).
function Orders() {
  return <OrdersPanel />;
}

export default Orders;
