import { useEffect, useState } from "react";
import axios from "axios";

function App() {
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    axios
      .get("http://localhost:3000/api/usuarios")
      .then((response) => {
        setUsuarios(response.data);
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  return (
    <div>
      <h1>Usuarios</h1>

      {usuarios.map((usuario) => (
        <div key={usuario.id}>
          <h3>{usuario.nombre}</h3>
          <p>{usuario.email}</p>
        </div>
      ))}
    </div>
  );
}

export default App;