import { useCallback, useEffect, useState } from "react";
import usuarioService from "../services/usuario.service";

const MENSAJE_ERROR_LISTAR =
  "No pudimos cargar los usuarios. Intentá de nuevo más tarde.";

// Maneja el estado de la lista completa de usuarios (RF-045). Las pantallas
// de Vendedores (RF-007) y Usuarios (RF-045) comparten este hook: el
// contrato del backend no expone un endpoint dedicado para "listar solo
// vendedores", así que Sellers.jsx reutiliza esta misma lista y filtra por
// `rol.nombre === "vendedor"` en el cliente.
//
// `actualizarEstadoLocal` NO llama a la API: cada pantalla decide qué
// endpoint invocar (PUT /vendedores/:id/estado vs PATCH /usuarios/:id/estado,
// según el contrato) y, si la llamada tiene éxito, refleja el cambio acá
// para no tener que recargar toda la lista.
export function useUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const recargar = useCallback(() => {
    setLoading(true);
    setError("");

    return usuarioService
      .listarUsuarios()
      .then((data) => setUsuarios(data))
      .catch(() => setError(MENSAJE_ERROR_LISTAR))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let activo = true;

    usuarioService
      .listarUsuarios()
      .then((data) => {
        if (activo) setUsuarios(data);
      })
      .catch(() => {
        if (activo) setError(MENSAJE_ERROR_LISTAR);
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    return () => {
      activo = false;
    };
  }, []);

  const actualizarEstadoLocal = useCallback((id, estado) => {
    setUsuarios((prev) =>
      prev.map((usuario) =>
        usuario.id === id ? { ...usuario, estado } : usuario,
      ),
    );
  }, []);

  return { usuarios, loading, error, recargar, actualizarEstadoLocal };
}
