# Sprint 3 — Revisión y retrospectiva

RF cubiertos: RF-018, RF-019, RF-021, RF-022, RF-024, RF-025, RF-026 (MOD-03, MOD-04, MOD-05).
RF-027, RF-028 y RF-029 quedan **preparados pero no conectados** (diseño + validación de estados): dependen de `Pedido`, que es Sprint 4.

Verificado el 14/10/2026 sobre la punta de `sprint-3` (`6c529d3`, incluye los PR #10, #12 a #18).

## Resultado de la verificación automática

`cd backend && npm test` contra una base descartable (migrada y con seed), dos corridas seguidas: **215/215 en las dos, sin flakiness**.

| Archivo | Tests |
|---|---|
| `carrito.http.test.js` | 39 |
| `envio.http.test.js` | 13 |
| `envio.transiciones.test.js` | 46 |
| `inventario.ajuste.test.js` | 18 |
| `inventario.descuento.test.js` | 33 |
| `zonas.http.test.js` | 66 |

Antes de este sprint el backend no tenía ningún test automático. Los tests escriben en la base, así que el helper (`tests/helpers/entorno.js`) **se niega a correr si el nombre de la base no contiene `test` o `scratch`**.

## Checklist de aceptación (tarjeta "QA y cierre")

| # | Prueba | Resultado |
|---|--------|-----------|
| 1 | Agregar al carrito más unidades que el stock | ✅ `409 STOCK_INSUFICIENTE` ("Disponible: 3"); sumar sobre lo que ya hay en el carrito también da 409 |
| 2 | Dos sesiones intentan, en conjunto, superar el stock | ⚠️ **Se puede**: ver "Sobreventa" más abajo |
| 3 | Envío para una dirección dentro y fuera de zona | ✅ Bogotá: `$8.000`; Pasto y Leticia (sin zona): `409 SIN_COBERTURA` con mensaje claro |
| 4 | Subtotal + envío + total contra precios reales | ✅ coincide exacto: `19990,50 × 2 + 35000 × 3 = 144.981`, envío `8.000`, total `152.981` |
| 5 | Consola del navegador sin errores bloqueantes | ✅ en cada rama de frontend antes de mergear (solo los 409 esperados); **no se repitió en el navegador sobre la punta integrada** |

## Sobreventa: qué garantiza hoy el sistema y qué no

**Garantiza** (verificado con escenarios repetidos 20 veces y tests de concurrencia):

- El stock **nunca queda negativo**. `descontarPorPedido` y `registrarAjuste` usan un UPDATE condicional atómico (`WHERE stock >= n`). En 60 carreras de dos escritores (20 de dos descuentos, 20 de un ajuste contra un descuento y 20 con el orden invertido para descartar un sesgo del event loop) hubo siempre exactamente un ganador; el perdedor recibió `StockInsuficienteError` y el stock mínimo observado fue 1.
- Un descuento rechazado no deja movimientos colgados (exactamente un `InventarioMovimiento` por ganador).
- El carrito rechaza con 409 una cantidad mayor al stock actual.

**No garantiza:**

- **El carrito no reserva stock** (decisión de diseño): dos clientes pueden tener 2 unidades cada uno sobre un stock de 3, y los dos `POST` devuelven 201. La sobreventa solo se corta cuando alguien ejecuta `descontarPorPedido`, y el segundo comprador se entera recién al pagar. Esa validación del carrito (leer el stock y escribir después) sirve como ayuda de UX, no como garantía.
- **Hoy ningún flujo real descuenta stock.** No existe creación de pedido ni confirmación de pago en `sprint-3`: `descontarPorPedido` no tiene ningún invocador fuera de los tests. La garantía de no-sobreventa vale para la función aislada, **no para el sistema de punta a punta**; se completa en Sprint 4.
- `descontarPorPedido` **no es idempotente** (RN-009): dos llamadas con el mismo `pedidoId` descuentan dos veces. Tampoco hay reposición por cancelación (ERS RF-019). Ambas requieren un guard o una columna nueva (migración).

## Criterios de aceptación por RF

| RF | Estado | Nota |
|---|---|---|
| RF-018 validación de stock en el carrito | ✅ | Con la salvedad de arriba (no reserva) |
| RF-019 descuento de inventario | ⚠️ Parcial | Función atómica lista y probada; sin invocador, sin idempotencia, sin reposición |
| RF-021 agregar al carrito | ✅ | Backend y UI (detalle de producto) |
| RF-022 modificar y eliminar | ✅ | Backend y UI |
| RF-024 resumen de compra | ✅ | Subtotal, envío y total; UI con selector de dirección |
| RF-025 costo de envío | ✅ | Por zona/ciudad; sin cobertura → 409 claro |
| RF-026 zonas y tarifas | ✅ | Crear, listar, cambiar tarifa, activar/desactivar; backend y panel admin |
| RF-027/028/029 envío | 📐 Preparado | Doc de diseño + `validarTransicionEstado`; se conecta en Sprint 4 |

## Hallazgos de esta revisión

Cada PR de este sprint pasó una revisión independiente del diff antes de mergearse. Encontraron problemas reales que los tests del propio autor no veían:

1. **Costo de tarifa en cero por la puerta de atrás** (PR #14): `0.00000001` pasaba la validación `costo > 0` (tolerancia de decimales demasiado laxa) y MySQL lo guardaba como `0.00`. Se corrigió con un mínimo de `0,01` y test de regresión.
2. **Pérdida de actualizaciones en `registrarAjuste`** (PR #16): era leer → escribir un stock absoluto; un ajuste manual concurrente con un descuento podía pisar el descuento y sobrevender. Ahora es un UPDATE relativo atómico, con el mismo contrato externo.
3. **Foco inicial en el botón destructivo** (PR #18): en el modal "Desactivar zona" el foco caía sobre "Desactivar zona"; un Enter accidental la desactivaba. Ahora cae en "Cancelar".
4. **Carrera en el carrito** (PR #17): una mutación iniciada justo cuando llegaban las direcciones podía dejar "Calculando…" colgado.

## Qué funcionó

- Tests primero (rojo → verde) y **pruebas de mutación** en las piezas críticas: romper a propósito el UPDATE condicional hace fallar los tests de concurrencia, o sea que los tests sí detectan el bug que dicen detectar.
- QA real en navegador contra una base descartable antes de abrir cada PR de frontend, incluyendo el efecto cruzado: desactivar una zona corta el envío del cliente, y reactivarla o cambiar la tarifa lo restablece.
- El patrón Controller → Service → Repository, los errores `{error:{codigo,mensaje,detalles}}` y el aislamiento por usuario (RN-003) se mantuvieron en carrito, envío y zonas.

## Qué no funcionó / ajustes para Sprint 4

- **El `sprint-4` se ramificó de `main` sin el código de Sprint 3** y hoy está roto: `pago.service.js` no compila (clase declarada dos veces) y requiere `../../prisma/client`, que no existe; `backend/src/services/pedido.service.js` contiene código de frontend (`import axios`); hay controllers en carpetas equivocadas, falta `pedido.routes.js`, y `pedido.repository.js` crea su propio `PrismaClient` sin adapter (en Prisma 7 falla). Además redefine `ZonaCobertura` y `TarifaEnvio` con enums distintos a los de `sprint-3`, no incluye `Carrito`, llama a `registrarAjuste` con una firma que no existe y asume que el stock se descuenta **al crear el pedido** (la tarjeta decía "al confirmar el pago"). Hay que rebasar `sprint-4` sobre `sprint-3` y resolver el choque de esquema antes de seguir.
- **Desbalance de trabajo**: de los 53 commits (sin merges) del sprint, 40 son de una persona y 13 de las otras dos. Conviene repartir las tarjetas de Sprint 4 con responsables explícitos en el tablero (hoy Melina y Valentina no son miembros del workspace de Notion y no se les puede asignar).
- **El PR #10 se mergeó antes de que subiera un commit pendiente** (hubo que hacer el #12 de corrección) y la migración `20261002130000_add_carrito_zonas_tarifas` se editó en su lugar después de haber entrado: quien ya la tenga aplicada debe correr `npx prisma migrate reset` en su base local.
- Varias tarjetas se movieron a mano a "En desarrollo" mientras se trabajaban en paralelo: acordar quién actualiza el tablero y cuándo.
- **Datos de prueba con tildes**: crear usuarios y direcciones con `curl` desde Git Bash en Windows guarda la `á` con otra codificación y rompe la cobertura ("Bogot�"). Usar scripts de Node (`fetch`) o la propia UI.

## Deuda y puntos abiertos para el Sprint Planning de Sprint 4

1. **Descontar stock en el flujo real**: invocar `descontarPorPedido(items, { usuarioId, pedidoId, tx })` dentro de la transacción de creación del pedido (con el cliente `tx`, nunca el `prisma` raíz), y decidir la firma de `registrarAjuste` que espera `pago.service.js`.
2. **Idempotencia y cancelación** (RN-009, ERS RF-019): guard por `pedidoId` y reposición de stock; requiere migración.
3. **RF-027/028/029**: conectar `validarTransicionEstado`; agregar `HistorialEstadoEnvio` (RF-028 pide historial con fecha y hora, RF-029 el usuario de cada cambio, y `InfoEnvio` solo guarda `actualizadoEn`); decidir si la fuente de verdad del estado es `InfoEnvio` o `EstadoPedido` (repiten los mismos 4 valores).
4. **Zonas**: `permiteContraEntrega` (lo usa el pago contra entrega de `sprint-4`) no existe en el modelo de `sprint-3`; no se puede renombrar/editar una zona; no hay enlace al panel `/admin/envios` desde ninguna navegación (no hay menú admin).
5. **País de los datos de ejemplo**: el seed carga zonas de Colombia (coherente con `es-CO`, precios en COP y teléfonos de prueba) pero las tarjetas hablan de Lima. Confirmar con el equipo.
6. **Roles del carrito**: las rutas de carrito y tarifa exigen rol `cliente` (ERS 4.1); vendedor y admin reciben 403. Confirmar que es lo deseado.
7. **Carrito**: `obtenerConItems` no filtra productos desactivados (un producto dado de baja puede seguir en el carrito); sin miniaturas porque el backend no incluye imágenes en los ítems; dos `POST /carrito/items` simultáneos de un cliente sin carrito pueden dar un `409 CONFLICTO` con detalles crudos del driver (carrera en `obtenerOCrear`, no afecta el stock).
8. **Accesibilidad de componentes comunes**: `Input` no acepta `id`/`aria-*`/`maxLength`, `Button` no acepta `aria-label`, `Modal` no maneja foco ni `role="dialog"`.
9. **Validación inconsistente de errores**: `auth.js`, inventario y producto siguen respondiendo `{error: "..."}` fuera del formato del DDS §5.3.

## No verificado en esta revisión

- Navegador sobre la punta integrada de `sprint-3` (se probó cada rama de frontend por separado antes de mergear; el merge entre #17 y #18 fue limpio).
- Responsive en móvil, doble clic real, backend caído ("Reintentar"), token vencido, teclado y lector de pantalla.
- Concurrencia con más de dos escritores, con más de una variante por pedido, o con varias instancias del servidor.
- Cualquier flujo de punta a punta de compra (no existe todavía).

## Cierre de rama

El merge de `sprint-3` a `main` se hace vía Pull Request revisado (tarjeta "[Sprint 3 - 11]"). Al mergearlo: `git tag sprint-3-done` y `git push origin sprint-3-done`.
