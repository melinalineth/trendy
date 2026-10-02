# Sprint 1 — Revisión y retrospectiva

RF cubiertos: RF-001, RF-002, RF-003, RF-005, RF-006, RF-007, RF-045, RF-046 (MOD-01, MOD-10).

## Checklist de aceptación por RF (ERS §3.1)

| # | Prueba | Resultado |
|---|--------|-----------|
| 1 | Registrar un cliente nuevo y loguearse | ✅ Pasa |
| 2 | `passwordHash` en la base es un hash bcrypt, nunca texto plano | ✅ Pasa (`$2*$NN$...`, 60 caracteres) |
| 3 | Token de cliente contra `GET /api/v1/usuarios` (ruta de admin) → 403 | ✅ Pasa |
| 4 | Login con un vendedor desactivado (`estado: INACTIVO`) → falla | ✅ Pasa (401) |
| 5 | Cliente no puede ver direcciones de otro usuario cambiando el id | ✅ Pasa — `GET /direcciones` siempre filtra por el usuario del token, no expone un endpoint por id ajeno |
| 6 | Cambiar permisos de un rol y confirmar que el usuario logueado con ese rol solo ve el cambio después de volver a loguearse | ⚠️ No verificable todavía — no hay catálogo de `Permiso` seedeado (`GET /roles` responde "sin permisos configurados"), es una limitación conocida del MVP, no un bug |
| 7 | Consola del navegador sin errores ni warnings bloqueantes | ✅ Pasa (después de los 2 fixes de esta revisión, ver abajo) |

## Hallazgos de esta revisión

Al correr por primera vez el frontend completo en un navegador real (contra una base MySQL real, no solo `npm run build`/lint) se encontraron dos bugs que rompían la app **en `main`**, no solo en una rama sin mergear:

1. **Crítico**: `Header.jsx` renderizaba `<SearchBar />` sin importarlo. Como no hay error boundary, React desmontaba el árbol completo ante la excepción — la app entera mostraba una pantalla en blanco en cualquier ruta.
2. **Importante**: 8 páginas (login, registro, recuperar/restablecer contraseña, direcciones, y los 3 paneles de admin) importaban `Alert` desde una ruta que no existe (`components/Alert` en vez de `components/common/Alert`). No se notaba en el camino feliz porque `Alert` solo se renderiza ante un error, pero rompía la página entera apenas login/registro fallaban.

Ambos se corrigieron y se abrió [PR #9](https://github.com/melinalineth/trendy/pull/9) directo contra `main`, separado del trabajo de Sprint 2.

## Qué funcionó

- El patrón Controller → Service → Repository se mantuvo consistente en los 8 RF, sin que ningún repository volviera a instanciar su propio `PrismaClient`.
- `roleGuard` (backend) y `RoleGuard` (frontend) coinciden en criterio: probado con token de cliente contra ruta de admin (403) y navegando como cliente a `/admin/vendedores` (redirige a `/`).
- El flujo completo de recuperación de contraseña (solicitar token → restablecer → loguearse con la contraseña nueva) funciona de punta a punta.

## Qué no funcionó / ajustes para Sprint 2

- **Ningún RF de Sprint 1 se había probado manualmente en navegador antes de esta revisión** — el frontend se validaba solo con `npm run lint`/`node --check`, lo que dejó pasar dos bugs que rompían el 100% de las páginas. Para Sprint 2 en adelante, cada ronda de desarrollo debería incluir al menos una pasada manual en navegador antes de marcar una tarjeta "Completado", no solo checks estáticos.
- No hay `docker-compose` con MySQL utilizable de punta a punta en este entorno de desarrollo (el daemon de Docker Desktop es inestable en esta máquina) — la verificación de esta revisión se hizo contra una instancia de MySQL nativa existente. El equipo debería documentar un fallback estable (MySQL nativo o WSL) en vez de depender únicamente de Docker Desktop.
- El catálogo de `Permiso` sigue sin seed — RF-046 (gestión de roles/permisos) tiene la UI y el endpoint listos, pero no hay datos reales para probar la asignación de permisos todavía.

## Cierre de rama

El merge a `main` de Sprint 1 ya se hizo vía [PR #7](https://github.com/melinalineth/trendy/pull/7) (mergeado el 22/09/2026); el hotfix de los 2 bugs de esta revisión va aparte, en el PR #9, porque afecta código que ya está en `main`.
