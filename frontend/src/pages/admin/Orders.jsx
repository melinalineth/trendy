import OrdersPanel from "../../components/orders/OrdersPanel";

// Wrapper de ruta: la implementación vive en OrdersPanel (compartida con
// /vendedor/pedidos). Solo el admin puede cancelar pedidos vencidos.
function Orders() {
  return <OrdersPanel permitirCancelarVencidos />;
}

export default Orders;
