import "./AdminDashboard.css";

const AdminDashboard = () => {
  const stats = [
    {
      title: "Ventas totales",
      value: "$ 12.450.000",
      change: "+12%",
      icon: "✓",
      color: "green",
    },
    {
      title: "Pedidos",
      value: "124",
      change: "+8%",
      icon: "▣",
      color: "blue",
    },
    {
      title: "Clientes",
      value: "356",
      change: "+15%",
      icon: "♟",
      color: "purple",
    },
    {
      title: "Productos",
      value: "220",
      change: "+3%",
      icon: "◆",
      color: "orange",
    },
  ];

  const recentOrders = [
    {
      id: "#TRD-0012",
      price: "$ 89.900",
      status: "Enviado",
      statusClass: "sent",
    },
    {
      id: "#TRD-0011",
      price: "$ 120.000",
      status: "Procesando",
      statusClass: "processing",
    },
    {
      id: "#TRD-0010",
      price: "$ 66.000",
      status: "Pagado",
      statusClass: "paid",
    },
    {
      id: "#TRD-0009",
      price: "$ 99.900",
      status: "Pendiente",
      statusClass: "pending",
    },
  ];

  const menuItems = [
    { icon: "⌂", name: "Dashboard", active: true },
    { icon: "▣", name: "Productos" },
    { icon: "▤", name: "Pedidos" },
    { icon: "♟", name: "Clientes" },
    { icon: "♟", name: "Vendedores" },
    { icon: "▦", name: "Inventario" },
    { icon: "▥", name: "Reportes" },
    { icon: "▰", name: "Envíos" },
    { icon: "⚙", name: "Configuración" },
  ];

  return (
    <div className="admin-dashboard">
      {/* SIDEBAR */}
      <aside className="admin-sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">T</div>
          <span>Trendy</span>
        </div>

        <nav className="sidebar-menu">
          {menuItems.map((item) => (
            <div
              key={item.name}
              className={`sidebar-item ${
                item.active ? "active" : ""
              }`}
            >
              <span className="menu-icon">{item.icon}</span>
              <span>{item.name}</span>
            </div>
          ))}
        </nav>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="admin-main">

        {/* TOPBAR */}
        <header className="admin-topbar">
          <div className="search-box">
            <span>⌕</span>
            <input
              type="text"
              placeholder="Buscar..."
            />
          </div>

          <div className="topbar-actions">
            <button>♧</button>
            <button>◉</button>
            <button className="notification">
              ♧
              <span></span>
            </button>

            <div className="admin-profile">
              <div className="profile-avatar">A</div>
              <div>
                <strong>Admin</strong>
                <small>Administrador</small>
              </div>
              <span>⌄</span>
            </div>
          </div>
        </header>

        {/* CONTENIDO */}
        <section className="dashboard-content">

          <div className="dashboard-title">
            <div>
              <h1>Dashboard</h1>
              <p>Resumen general de la tienda</p>
            </div>
          </div>

          {/* TARJETAS */}
          <div className="stats-grid">
            {stats.map((stat) => (
              <div className="stat-card" key={stat.title}>
                <div className={`stat-icon ${stat.color}`}>
                  {stat.icon}
                </div>

                <div className="stat-info">
                  <span>{stat.title}</span>
                  <strong>{stat.value}</strong>
                  <small>{stat.change}</small>
                </div>
              </div>
            ))}
          </div>

          {/* GRÁFICO Y PEDIDOS */}
          <div className="dashboard-grid">

            {/* GRÁFICO */}
            <div className="dashboard-card sales-card">
              <div className="card-header">
                <div>
                  <h2>Ventas de los últimos 30 días</h2>
                  <p>Comportamiento de las ventas</p>
                </div>

                <select>
                  <option>Últimos 30 días</option>
                  <option>Últimos 7 días</option>
                  <option>Este año</option>
                </select>
              </div>

              <div className="chart-container">

                <div className="chart-y">
                  <span>$3M</span>
                  <span>$2M</span>
                  <span>$1M</span>
                  <span>$0</span>
                </div>

                <div className="chart">
                  <div className="chart-lines">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>

                  <svg
                    className="sales-svg"
                    viewBox="0 0 700 260"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient
                        id="salesGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopOpacity="0.25"
                        />
                        <stop
                          offset="100%"
                          stopOpacity="0"
                        />
                      </linearGradient>
                    </defs>

                    <polygon
                      className="chart-area"
                      points="
                        0,220
                        45,180
                        90,195
                        135,160
                        180,180
                        225,145
                        270,170
                        315,135
                        360,155
                        405,125
                        450,145
                        495,90
                        540,120
                        585,105
                        630,125
                        700,95
                        700,260
                        0,260
                      "
                    />

                    <polyline
                      className="chart-line"
                      points="
                        0,220
                        45,180
                        90,195
                        135,160
                        180,180
                        225,145
                        270,170
                        315,135
                        360,155
                        405,125
                        450,145
                        495,90
                        540,120
                        585,105
                        630,125
                        700,95
                      "
                    />

                    <circle cx="495" cy="90" r="5" />
                    <circle cx="700" cy="95" r="5" />
                  </svg>

                  <div className="chart-x">
                    <span>1 Jun</span>
                    <span>8 Jun</span>
                    <span>15 Jun</span>
                    <span>22 Jun</span>
                    <span>30 Jun</span>
                  </div>
                </div>
              </div>
            </div>

            {/* PEDIDOS RECIENTES */}
            <div className="dashboard-card orders-card">

              <div className="card-header">
                <div>
                  <h2>Pedidos recientes</h2>
                  <p>Últimas compras realizadas</p>
                </div>

                <button className="view-all">
                  Ver todos
                </button>
              </div>

              <div className="orders-list">
                {recentOrders.map((order) => (
                  <div className="order-row" key={order.id}>
                    <div className="order-info">
                      <strong>{order.id}</strong>
                      <span>{order.price}</span>
                    </div>

                    <span
                      className={`order-status ${order.statusClass}`}
                    >
                      {order.status}
                    </span>
                  </div>
                ))}
              </div>

            </div>
          </div>

        </section>
      </main>
    </div>
  );
};

export default AdminDashboard;