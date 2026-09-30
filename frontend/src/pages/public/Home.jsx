// Placeholder mínimo: esta página estaba vacía y AppRouter.jsx ya la
// importaba para la ruta "/", lo que rompía el build al conectar el router
// en App.jsx. El contenido real de Home queda fuera del alcance de esta
// ronda (RF-001/002/003 de auth) y debería reemplazarse en su propio sprint.
function Home() {
  return (
    <div>
      <h1>Trendy</h1>
    </div>
  );
}

export default Home;
