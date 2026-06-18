# Requerimientos

## Objetivo

Crear una aplicacion web de flujo de caja para ADENTU Ingeniería SpA, orientada al registro, seguimiento y conciliacion de movimientos financieros.

## Alcance inicial

- Autenticacion por correo.
- Roles de acceso: `ADMIN`, `FINANCE`, `MOVEMENT_ENTRY` y `READ_ONLY`.
- Empresa unica: ADENTU Ingeniería SpA.
- Formato regional `es-CL`.
- Zona horaria `America/Santiago`.
- Moneda base `CLP`.
- Menu principal.
- Paginas vacias para:
  - Recurrentes
  - Calendario
  - Movimientos
  - Conciliacion
  - Configuracion

## Reglas base

- Los montos se expresan en pesos chilenos.
- Las fechas se presentan en horario de Chile continental.
- La aplicacion debe mantener una base preparada para permisos por rol.
- Las pruebas automaticas deben cubrir utilidades criticas y componentes principales.

## Modelo financiero

### Entidades

- `BusinessUnit`: unidad de negocio obligatoria para cada movimiento. Datos iniciales: Inspecciones, TVM, Saesa, Plataforma, Casa Matriz y Sin asignar.
- `Project`: proyecto opcional asociado a una unidad de negocio.
- `CostCenter`: centro de costo opcional para clasificacion interna.
- `AccountingAccount`: cuenta contable obligatoria para cada movimiento.
- `BankAccount`: cuenta bancaria de la empresa. Dato inicial: Cuenta Corriente Santander en CLP.
- `OpeningBalance`: saldo inicial configurable por cuenta bancaria. No se debe inventar monto; se crea solo si se configura explicitamente.
- `Movement`: ingreso o egreso financiero con monto positivo, cuenta contable, unidad de negocio, fecha proyectada y fecha real opcional.
- `Payment`: pago o cobro asociado a un movimiento, permite pagos parciales.
- `ExchangeRate`: tipo de cambio diario entre monedas permitidas.
- `AuditLog`: registro de auditoria para acciones relevantes sobre entidades del sistema.

### Monedas

- `CLP`
- `UF`
- `EUR`
- `USD`

### Estados de movimiento

- `PROJECTED`
- `PENDING`
- `PARTIALLY_PAID`
- `PAID_OR_COLLECTED`
- `OVERDUE`
- `CANCELLED`

### Reglas de datos financieros

- Los montos se guardan como `Decimal`.
- El dinero se guarda siempre como valor positivo.
- El sentido del flujo se determina con `Movement.type`: `INCOME` o `EXPENSE`.
- Cuenta contable y unidad de negocio son obligatorias.
- Proyecto y centro de costo son opcionales.
- Se separa fecha proyectada (`projectedDate`) de fecha real (`realDate`).
- Los pagos parciales se registran con `Payment`.
- Los datos financieros no se eliminan fisicamente; se marcan con campos como `deletedAt`, `cancelledAt` o estados de cancelacion.
