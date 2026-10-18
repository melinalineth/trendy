# API de consulta de ventas (RF-042)

Módulo MOD-09 Ventas. Endpoint de **solo lectura** para que el personal consulte las ventas
registradas (el registro y la anulación son RF-041 y no se exponen por HTTP). Código:
`backend/src/dtos/venta.dto.js`, `controllers/venta.controller.js`, `routes/venta.routes.js`,
`services/venta.service.js` (`consultar`) y `repositories/venta.repository.js` (`listar`, `contar`,
`totalesPorEstado`).

## 1. Endpoint y roles

`GET /api/v1/ventas`

| Rol | Resultado |
| --- | --- |
| `admin` | 200 |
| `vendedor` | 200 |
| `cliente` | 403 `ACCESO_DENEGADO` (formato estándar) |
| sin token / token inválido | 401 (lo responde el middleware compartido `auth.js`, que en todo el proyecto devuelve `{ "error": "<texto>" }`, no el formato de tres claves) |

**Decisión de v1.0:** admin y vendedor ven **TODAS** las ventas y **los mismos totales**. Las «ventas
asignadas» a un vendedor quedan para una versión posterior (no existe modelo de asignaciones). El
control de rol vive en la ruta (`roleGuard(["admin", "vendedor"])`), después de `auth` y **antes** de
validar la query: un cliente con filtros inválidos recibe 403, no 400.

## 2. Query

Todos los parámetros son opcionales. Cualquier otro nombre se rechaza.

| Parámetro | Formato | Regla |
| --- | --- | --- |
| `desde` | `YYYY-MM-DD` | Inclusivo. Desde las 00:00:00.000 (hora de Bogotá, -05:00) de ese día. |
| `hasta` | `YYYY-MM-DD` | Inclusivo. Hasta las 23:59:59.999 (hora de Bogotá) de ese día. |
| `estado` | `REGISTRADA` \| `ANULADA` | Ausente = todas. Solo filtra el listado (ver §4). |
| `pagina` | entero | ≥ 1, por defecto 1. Tope técnico 100000. |
| `limite` | entero | 1..100, por defecto 50. |

Reglas de fechas:

- Deben existir en el calendario (`2027-02-29` es inválida; `2028-02-29` es válida).
- El **año** debe estar entre **2000 y 2100** (ambos inclusive); fuera de ese rango (por ejemplo
  `9999-12-31`, `0100-01-01` o `1999-12-31`) es un 400. `desde=2000-01-01` y `hasta=2100-12-31` son
  válidos. Los instantes se calculan con `Date.UTC` (medianoche de Bogotá = 05:00Z), no con texto.
- `desde` > `hasta` es error. Con ambas, el rango máximo es **366 días inclusivos** (del `2028-01-01`
  al `2028-12-31` hay 366). Con una sola fecha no hay tope.
- **Zona horaria:** las fechas son días de Bogotá (UTC-5 todo el año, sin horario de verano), no
  UTC. Internamente `hasta` se resuelve como «antes de las 00:00 de Bogotá del día siguiente», que
  equivale a 23:59:59.999. Ejemplo: una venta registrada el 31/10 a las 23:30 en Bogotá (04:30 UTC
  del 01/11) entra con `hasta=…-10-31` y **no** con `hasta=…-10-30`; la de las 00:10 de Bogotá del
  01/11 **no** entra con `hasta=…-10-31`.

## 3. Respuesta 200

```json
{
  "ventas": [
    {
      "id": 12,
      "pedidoId": 340,
      "numeroPedido": "PED-17619521234561234",
      "estadoPedido": "CONFIRMADO",
      "fecha": "2026-11-01T04:30:00.000Z",
      "cliente": { "id": 7, "nombre": "Ana Pérez" },
      "metodoPago": "MERCADO_PAGO",
      "estado": "REGISTRADA",
      "anuladaEn": null,
      "responsable": null,
      "anuladaPor": null,
      "subtotal": 89900,
      "costoEnvio": 8000,
      "total": 97900,
      "productos": [
        {
          "id": 801,
          "producto": "Camisa de Lino",
          "sku": "CAM-LIN-M-AZU",
          "talla": "M",
          "color": "Azul",
          "cantidad": 2,
          "precioUnitario": 44950,
          "subtotal": 89900
        }
      ]
    }
  ],
  "paginacion": { "pagina": 1, "limite": 50, "total": 123, "totalPaginas": 3 },
  "totales": {
    "registradas": { "cantidad": 100, "total": 9500000 },
    "anuladas": { "cantidad": 23, "total": 1800000 }
  }
}
```

Campos de cada venta:

- `fecha`: `registradaEn` en ISO UTC. `anuladaEn`: ISO UTC o `null`.
- `numeroPedido`: `Pedido.numero`, con el formato real `PED-<timestamp en ms><4 dígitos>` (lo genera
  `pedido.repository.generarNumero`); el valor del ejemplo es ilustrativo. `estadoPedido`:
  `Pedido.estado` actual.
- `cliente`: solo `id` y `nombre` (nunca correo ni hash). `responsable`: `{ id, nombre }` del
  admin/vendedor que la registró, o `null` si la disparó el webhook de Mercado Pago.
  `anuladaPor`: `{ id, nombre }` del admin/vendedor que **ANULÓ** la venta (el que canceló el pedido
  contra entrega ya confirmado; viene de `Venta.anuladaPorId`). Es una persona distinta de
  `responsable` (quien la registró): una venta puede haberla registrado un admin y anulado un
  vendedor, y cada dato se muestra por separado. Es `null` cuando la venta no está anulada (estado
  `REGISTRADA`) y también cuando se anuló sin usuario o antes de que existiera el dato (ventas
  anuladas legadas): una venta `ANULADA` con `anuladaPor: null` significa «quién la anuló no está
  registrado». Igual que `cliente`, solo `id` y `nombre`.
  **`cliente.nombre`, `responsable.nombre` y `anuladaPor.nombre` son los VIVOS** (el nombre actual del
  usuario), no un snapshot de cuando se registró o se anuló la venta: si el usuario cambia su nombre,
  las ventas viejas muestran el nuevo.
- `subtotal`, `costoEnvio`, `total`: **números en pesos COP**, los montos **copiados** a la venta al
  registrarla (no se recalculan del pedido).
- `productos`: una entrada por línea del pedido (`DetallePedido`), ordenadas por `id`.
  `precioUnitario` y `subtotal` son los **históricos** de la compra (RN-008), nunca el precio vivo del
  producto. `producto`, `sku`, `talla` y `color` salen de la variante/producto **actuales**:
  `DetallePedido` no guarda una copia de esos textos (limitación conocida del modelo).
- Orden: `fecha` descendente, `id` descendente.
- `paginacion.totalPaginas = max(1, ceil(total / limite))`. `total` es la cantidad de ventas que
  cumplen **todos** los filtros (incluido `estado`). Una página más allá de la última devuelve
  `ventas: []` con 200.

### Montos exactos

Las columnas son `Decimal(10,2)`. Se parsea el **texto** del Decimal a centavos enteros y se divide
por 100 al final (igual que `pedido.service.js`); nunca se multiplican floats. Así `3 x 0.10` da `0.3`
y `3 x 19990.55` da `59971.65`. Las sumas de `totales` las hace MySQL con `SUM` sobre `Decimal`.

## 4. Totales

`totales` cubre **todas** las ventas que cumplen `desde`/`hasta` (no solo la página) y **IGNORA el
filtro `estado`**: las tarjetas «Registradas» y «Anuladas» siempre muestran el consolidado del
período, aunque el listado esté filtrado por uno de los dos estados. Sin ventas: ceros
(`{ "cantidad": 0, "total": 0 }`), nunca `null`.

## 5. Errores

Formato estándar del proyecto: `{ "error": { "codigo", "mensaje", "detalles" } }`.

Filtros inválidos (parámetro desconocido, repetido, vacío o mal formado, fechas imposibles, rango
invertido o mayor a 366 días, años fuera de 2000..2100, estado/pagina/limite fuera de rango): **400
`VALIDACION_FALLIDA`** (el mismo código que usan todos los 400 de validación del proyecto, incluido
`GET /pedidos`), con `detalles` como **arreglo de textos en español**, informando todos los problemas
juntos. Los textos de `detalles` **no llevan punto final**: el frontend los une con `". "`.

```json
{
  "error": {
    "codigo": "VALIDACION_FALLIDA",
    "mensaje": "Los filtros de consulta de ventas no son válidos",
    "detalles": [
      "Parámetros no permitidos: usuarioId",
      "desde debe tener el formato YYYY-MM-DD",
      "limite debe estar entre 1 y 100"
    ]
  }
}
```

## 6. Ejemplos

```
GET /api/v1/ventas?desde=2026-10-01&hasta=2026-10-31&estado=ANULADA&pagina=1&limite=20
Authorization: Bearer <JWT de admin o vendedor>
```

Devuelve solo las ventas anuladas de octubre (hora de Bogotá), de a 20, y en `totales` el
consolidado de **registradas y anuladas** de octubre.

```
GET /api/v1/ventas?limite=1000        -> 400 VALIDACION_FALLIDA
GET /api/v1/ventas  (como cliente)    -> 403 ACCESO_DENEGADO
GET /api/v1/ventas  (sin token)       -> 401
```

## 7. Alcance

Fuera de esta consulta: registrar/anular ventas por HTTP, detalle por id (el detalle viaja en
`productos`), reportes agregados por producto o categoría (RF-043/RF-044, v2.0) y ventas asignadas a
un vendedor.
