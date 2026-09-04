import { useState } from "react";
import "./TaskForm.css";

function TaskForm({ onAddTask }) {
  const [task, setTask] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validar que el campo no esté vacío
    if (task.trim() === "") {
      alert("Por favor, ingrese una tarea.");
      return;
    }

    // Enviar la tarea al componente padre
    onAddTask(task);

    // Limpiar el campo de texto
    setTask("");
  };

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Escribe una nueva tarea..."
        value={task}
        onChange={(e) => setTask(e.target.value)}
      />

      <button type="submit">
        Agregar
      </button>
    </form>
  );
}

export default TaskForm;