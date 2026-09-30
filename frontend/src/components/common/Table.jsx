import "./Table.css";

// Tabla genérica y sin lógica de negocio: quien la usa arma sus propias
// columnas (con `render` opcional para celdas custom, ej. un botón de
// acción) y le pasa las filas ya resueltas. Se reutiliza en Sellers, Users
// y Roles (panel de administración).
function Table({ columns, rows, keyField = "id", emptyMessage = "No hay datos para mostrar." }) {
  if (!rows || rows.length === 0) {
    return <p className="table-empty">{emptyMessage}</p>;
  }

  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row[keyField]}>
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
