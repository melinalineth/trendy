# Bitácora Sprint 3 — Trendy

## Información general

**Proyecto:** Trendy  
**Sprint:** 3  
**Duración:** 2 semanas  
**Capacidad estimada:** 72 horas-persona  
**Módulos:** MOD-03 Inventario, MOD-04 Carrito de compras y MOD-05 Envíos

---

## Objetivo del Sprint

Completar la implementación inicial de inventario, carrito de compras y
envíos, manteniendo la trazabilidad con los requisitos funcionales definidos
en la ERS v1.2 y el diseño técnico del DDS v1.2.

---

## Actividades realizadas

### 1. Modelo de carrito

Se incorporaron al esquema Prisma las entidades:

- `Carrito`
- `ItemCarrito`

`Carrito` mantiene una relación uno a uno con `Usuario`, mediante el campo
`usuarioId` con restricción `@unique`.

`ItemCarrito` relaciona un carrito con una variante de producto y almacena
la cantidad seleccionada.

También se estableció una restricción única entre:

- `carritoId`
- `varianteId`

para evitar que una misma variante aparezca como líneas duplicadas dentro
del mismo carrito.

### 2. Modelo de cobertura y tarifas de envío

Se incorporaron las entidades:

- `ZonaCobertura`
- `TarifaEnvio`

Una zona de cobertura puede tener varias tarifas de envío y cada tarifa
pertenece a una zona.

Como propuesta inicial, una zona se identifica mediante:

- Departamento
- Ciudad

Esta decisión queda pendiente de confirmación por parte del equipo, ya que
el DDS establece el uso de zonas de cobertura pero no define de manera
específica que la identificación deba realizarse exclusivamente mediante
coincidencia exacta de departamento y ciudad.

### 3. Integración con las entidades existentes

Se agregaron las relaciones necesarias entre:

- `Usuario` → `Carrito`
- `Carrito` → `ItemCarrito`
- `ItemCarrito` → `Variante`
- `ZonaCobertura` → `TarifaEnvio`

Estas relaciones permiten preparar el modelo de datos para las operaciones
del carrito y el cálculo de costos de envío.

---

## Requisitos relacionados

### RF-021 — Agregar productos al carrito

El cliente podrá agregar una variante disponible y una cantidad determinada.

### RF-022 — Modificar el carrito

El cliente podrá modificar cantidades o eliminar productos del carrito.

### RF-024 — Cálculo del resumen de compra

El sistema deberá calcular subtotal, costo de envío y total antes de
confirmar el pedido.

### RF-025 / RF-026 — Envíos

El sistema deberá calcular el costo de envío según la ubicación y permitir
la configuración de cobertura y tarifas.

---

## Decisiones técnicas

### Carrito

Se utiliza:

```prisma
usuarioId Int @unique