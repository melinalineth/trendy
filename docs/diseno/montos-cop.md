# Regla de negocio: precios y tarifas en pesos enteros (COP)

Módulo MOD-07 (Pagos con Mercado Pago), con impacto en catálogo (MOD-02) y zonas de cobertura
(RF-026).

## 1. La regla

**Todo monto en COP que se cobra se carga y se envía a Mercado Pago en pesos enteros, sin
centavos.** Aplica a:

- el `precio` de un producto;
- el `costo` de una tarifa de envío (que viaja a Mercado Pago como la línea «Costo de envío»);
- por consecuencia, el `unit_price` de cada ítem de la preferencia de Checkout Pro.

Las columnas **siguen siendo `Decimal(10,2)`**: no hay migración de Prisma. La regla se aplica al
cargar los datos (validación) y como defensa al crear la preferencia, no en el esquema.

## 2. Por qué

Fuentes de terceros (**no oficiales**) reportan que Mercado Pago solo acepta montos enteros en
COP: un `unit_price` con centavos (p. ej. `19990.50`) haría fallar la creación de la preferencia
o el cobro. **La documentación oficial no lo confirma y no pudimos probarlo contra Mercado Pago
real** (el portal de developers estaba caído y no hay credenciales sandbox). Está **pendiente de
confirmar en sandbox**.

Se adopta igual porque el costo de la regla es bajo (en Colombia los precios minoristas no llevan
centavos) y el riesgo de no tenerla es alto: un cliente llegaría al checkout y la pasarela
rechazaría el pago. Si el sandbox demuestra que Mercado Pago sí acepta centavos, la regla se puede
relajar en los DTOs y en `crearPreferencia` sin tocar el modelo de datos.

## 3. Dónde se aplica

| Capa | Archivo | Qué hace |
| --- | --- | --- |
| Alta/edición de producto | `backend/src/dtos/producto.dto.js` y `backend/src/services/producto.service.js` (`validarPrecio`, defensa en profundidad) | `precio` entero positivo y con tope `PRECIO_MAXIMO` = 99.999.999 (la columna `Decimal(10,2)` admite hasta 99.999.999,99; sin tope un `1e10` reventaría en MySQL). Mensajes: «El precio debe ser un valor entero en pesos (COP), sin centavos» y «El precio no puede superar 99999999 (COP)». |
| Alta/cambio de tarifa | `backend/src/dtos/zonaCobertura.dto.js` (`validarCosto`) | `costo` entero ≥ 1 y ≤ `COSTO_MAXIMO` (1.000.000). |
| Defensa al pagar | `backend/src/services/pago.service.js` (`crearPreferencia`) | Antes de llamar a Mercado Pago verifica que cada `unit_price` (incluido el envío) sea entero. Si no: 409 `MONTO_NO_ENTERO_COP` con el título de la línea, sin llamar a la pasarela y sin cambiar el pedido ni crear `Pago`. |
| Formularios | `frontend/src/components/products/FormularioProducto.jsx`, `frontend/src/pages/admin/ZonasCobertura.jsx` | Validación local en JS (`Number.isInteger` y el tope del precio) con los mismos mensajes que el backend. Los `<form>` llevan `noValidate` para que corra esa validación y se vea el mensaje en vez del tooltip nativo del navegador. `step="1"` solo guía las flechas del input: no valida. |

Los filtros de búsqueda por rango de precio (`precioMin` / `precioMax`) **no** cambian: pueden
seguir recibiendo decimales, porque solo comparan.

### Nota sobre `COSTO_MINIMO`

Antes la tarifa exigía un mínimo de `0.01` para evitar que un valor positivo minúsculo (`1e-8`)
pasara la tolerancia de decimales y MySQL lo guardara como `0.00` (tarifa en cero). Con la regla
«entero ≥ 1» ese bypass queda cerrado por construcción (`1e-8` y `0.5` no son enteros). Los tests de
`zonas.http.test.js` conservan los casos `1e-8` y `0.5` como regresión.

## 4. Datos existentes (legado)

La regla valida lo que se **carga de ahora en más**. No se migran ni se redondean datos viejos:

- Un **producto** con precio decimal ya guardado sigue mostrándose; al **editarlo** el formulario
  exige corregirlo a un entero.
- Una **tarifa** con centavos se reemplaza al cambiarla (se crea una nueva y la anterior queda
  inactiva, como siempre).
- Un **pedido** ya creado con `precioUnitario` o `costoEnvio` con centavos (el precio se congela al
  crear el pedido, RN-008) **no se podrá pagar con Mercado Pago**: `crearPreferencia` responde
  409 `MONTO_NO_ENTERO_COP`. `pedido.service.crearPedido` no se tocó: el alcance acordado fue solo
  el pago. Si en producción existen pedidos pendientes así, hay que corregirlos o cancelarlos a
  mano. El pago contra entrega no se ve afectado.
- Mismo efecto hacia adelante: mientras un producto con precio decimal (o una tarifa vigente con
  centavos) no se corrija, el pedido nuevo **se crea y reserva stock** (copia el precio y el envío
  vigentes) pero **no se puede pagar con Mercado Pago**: 409 `MONTO_NO_ENTERO_COP`. No hay salida
  por contra entrega, porque `registrarContraEntrega` exige que el pedido se haya creado con
  `metodoPago = CONTRA_ENTREGA`. El cliente tiene que comunicarse con la tienda (el frontend lo
  informa y no ofrece reintentar) y el stock vuelve cuando el pedido vence o se cancela.

### Revisión previa a habilitar pagos reales

**Antes** de habilitar pagos reales hay que revisar el catálogo y las tarifas existentes con
consultas de solo lectura (nombres de tabla y columna según `backend/prisma/schema.prisma`; sin
`@@map`, la tabla se llama como el modelo):

```sql
-- Productos con precio con centavos
SELECT id, nombre, precio FROM Producto WHERE precio <> FLOOR(precio);

-- Tarifas de envío con centavos
SELECT id, zonaCoberturaId, costo, estado FROM TarifaEnvio WHERE costo <> FLOOR(costo);
```

Cada fila devuelta se corrige desde la administración (editar el producto / cambiar la tarifa),
que ya exige enteros.
