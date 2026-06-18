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

## Plan de cuentas

`AccountingAccount` representa un plan de cuentas jerarquico editable desde Configuracion.

### Campos

- Codigo unico por empresa.
- Nombre.
- Cuenta padre opcional.
- Tipo.
- Orden.
- Nivel.
- Activa.
- Permite movimientos.

### Tipos principales

- `INCOME`: Ingresos.
- `DIRECT_COST`: Costos directos.
- `ADMIN_EXPENSE`: Gastos administrativos.
- `TAX`: Impuestos.
- `FINANCING`: Financiamiento.
- `INVESTMENT`: Inversiones.
- `NON_OPERATIONAL`: Movimientos no operacionales.

### Plan inicial

- Ingresos: Servicios de inspeccion, Servicios de ingenieria, Arriendo de equipos.
- Costos directos: Personal de operaciones, Subcontratos, Equipos y materiales, Traslados y viaticos.
- Gastos administrativos: Remuneraciones, Honorarios, Cotizaciones previsionales, Arriendos, Software y licencias, Contabilidad, Seguros, Gastos bancarios.
- Impuestos: IVA y F29, PPM.
- Financiamiento: Creditos, Intereses.
- Inversiones: Compra de equipos.
- Movimientos no operacionales: Aportes de socios, Retiros de socios, Ajustes no operacionales.

### Reglas

- Solo `ADMIN` puede crear o modificar cuentas.
- Las cuentas padre no permiten movimientos.
- Las cuentas con `allowMovements=false` no permiten movimientos.
- No se permiten ciclos en la jerarquia.
- No se permiten codigos duplicados por empresa.
- Las cuentas usadas no se eliminan fisicamente; se desactivan.
- Los cambios se registran en `AuditLog`.

## Movimientos

La vista Movimientos permite registrar ingresos y egresos sin implementar todavia pagos, tipos de cambio, recurrencias, calendario ni conciliacion.

### Funciones

- Listado paginado.
- Filtros por fecha proyectada, estado, tipo, cuenta contable y unidad de negocio.
- Creacion de ingresos o egresos.
- Edicion de movimientos no cancelados.
- Cancelacion logica sin borrado fisico.

### Campos

- Tipo: `INCOME` o `EXPENSE`.
- Cuenta contable obligatoria.
- Descripcion.
- Monto bruto positivo.
- Moneda: `CLP`, `UF`, `EUR` o `USD`.
- Cuenta bancaria, con Cuenta Corriente Santander como default cuando exista.
- Unidad de negocio obligatoria, con Sin asignar como default cuando exista.
- Proyecto opcional.
- Centro de costo opcional.
- Fecha proyectada.
- Fecha real opcional.
- Estado.
- Notas.

### Reglas

- Solo cuentas contables activas, sin hijos y con `allowMovements=true` pueden recibir movimientos.
- `READ_ONLY` no puede crear, editar ni cancelar movimientos.
- Los permisos se validan en servidor.
- Crear, editar y cancelar movimientos registra auditoria en `AuditLog`.
- Cancelar un movimiento cambia su estado a `CANCELLED` y registra `cancelledAt`.

## Pagos y cobros

Los pagos y cobros se registran con `Payment` dentro del detalle de cada movimiento. En esta fase solo se registran pagos en `CLP`; los tipos de cambio quedan para una fase posterior.

### Funciones

- Registrar pago o cobro asociado a un movimiento.
- Permitir varios pagos por movimiento.
- Mostrar total pagado o cobrado.
- Mostrar saldo pendiente.
- Mostrar historial de pagos.
- Anular un pago sin borrarlo fisicamente.

### Reglas

- El monto del pago debe ser positivo.
- No se permiten pagos superiores al saldo pendiente.
- Sin pagos activos, el movimiento queda `PENDING`.
- Con pago parcial, el movimiento queda `PARTIALLY_PAID`.
- Con pago completo, el movimiento queda `PAID_OR_COLLECTED`.
- Al completar el pago se registra `realDate` del movimiento si aun no existe.
- Registrar o anular pagos usa transacciones de base de datos.
- Registrar o anular pagos se audita en `AuditLog`.
- Los permisos se validan en servidor.
- `READ_ONLY` no puede registrar ni anular pagos.

## Conversion a CLP

Los movimientos conservan su monto y moneda original, junto con la tasa usada para calcular el equivalente proyectado en CLP. Las tasas historicas guardadas no se recalculan automaticamente.

### Monedas soportadas

- `CLP`
- `UF`
- `EUR`
- `USD`

### Campos persistidos en movimiento

- Monto original.
- Moneda original.
- Fecha de conversion proyectada.
- Tipo de cambio proyectado.
- Monto proyectado en CLP.
- Fuente del tipo de cambio.
- Indicador de correccion manual.
- Motivo de correccion manual.

### Reglas

- `CLP` usa tasa `1`.
- Los movimientos pendientes usan la fecha proyectada para consultar tasa.
- Los pagos usan su fecha real; en esta fase se registran solo en `CLP` con tasa `1`.
- La tasa puede consultarse automaticamente mediante `ExchangeRateProvider`.
- La tasa puede corregirse manualmente cuando corresponda.
- Si la consulta automatica falla, se permite ingreso manual.
- Los calculos usan `Decimal`, nunca `float`.
- Las correcciones manuales se auditan en `AuditLog`.

## Recurrencias

`RecurrenceRule` define plantillas para generar movimientos proyectados automaticamente.

### Frecuencias

- `DAILY`: diaria.
- `BUSINESS_DAYS`: dias habiles.
- `EVERY_N_DAYS`: cada N dias.
- `WEEKLY`: semanal.
- `BIWEEKLY`: quincenal.
- `MONTHLY`: mensual.
- `QUARTERLY`: trimestral.
- `SEMIANNUAL`: semestral.
- `ANNUAL`: anual.

### Campos

- Cuenta contable.
- Descripcion.
- Monto.
- Moneda.
- Banco.
- Unidad de negocio.
- Proyecto opcional.
- Centro de costo opcional.
- Frecuencia.
- Fecha de inicio.
- Fecha de termino opcional.
- Estado.
- Notas.

### Reglas

- Excluir sabados, domingos y feriados.
- Mover fechas no habiles al dia habil siguiente.
- Si el dia 29, 30 o 31 no existe, usar el ultimo dia del mes.
- Permitir fecha de inicio y termino.
- Generar inicialmente 12 meses.
- Evitar movimientos duplicados por recurrencia y fecha nominal de ocurrencia.
- Cada movimiento generado mantiene `recurrenceRuleId` y `recurrenceOccurrenceDate`.
- Al desactivar una recurrencia, se conserva el historial de movimientos.
- Se permite editar una sola ocurrencia modificando el movimiento generado.
- Queda preparada la opcion `THIS_AND_FOLLOWING` para esta y las siguientes, sin modificar movimientos historicos en esta fase.
- Solo `ADMIN` y `FINANCE` administran recurrencias.
- La pagina Recurrentes permite listar, filtrar, crear, editar, activar, desactivar y generar movimientos de los proximos 12 meses.
- La vista previa muestra las proximas 10 ocurrencias e indica cuando una fecha fue movida por fin de semana o feriado.
- Desactivar requiere confirmacion y conserva historial.
- Crear, editar, desactivar y generar se auditan en `AuditLog`.

## Flujo de caja por dia habil

El sistema debe contar con servicios para calcular flujo de caja diario sin construir todavia la grilla visual del calendario.

### Calculos

- Saldo inicial.
- Ingresos proyectados.
- Egresos proyectados.
- Ingresos reales.
- Egresos reales.
- Flujo neto diario.
- Saldo acumulado diario.
- Totales semanales.

### Agrupaciones

- Categoria contable.
- Cuenta contable.
- Unidad de negocio.

### Reglas

- Horizonte inicial de 3 meses.
- Rango maximo de 12 meses.
- Solo dias habiles.
- La semana comienza el lunes.
- Movimientos pendientes usan `projectedAmountClp`.
- Movimientos pagados usan pagos reales en CLP.
- No debe existir doble conteo entre movimiento proyectado y pagos reales.
- Debe incluir saldo inicial de Cuenta Corriente Santander.
- Los calculos usan `Decimal`, nunca `float`.

### Filtros

- Unidad de negocio.
- Cuenta contable.
- Estado.
- Tipo ingreso/egreso.
- Moneda.

## Calendario

La pagina Calendario presenta el flujo de caja por dia habil usando el motor `cash-flow`; no duplica calculos ni consulta datos por celda.

### Funciones

- Horizonte inicial de 3 meses.
- Selector de 3, 6, 9 y 12 meses.
- Solo columnas de dias habiles.
- Separacion visual por semanas con semana iniciando lunes.
- Encabezados de fecha fijos.
- Primera columna fija.
- Desplazamiento horizontal.
- Filas jerarquicas contraibles por categoria y cuenta contable.
- Filas resumen: total ingresos, total egresos, flujo neto y saldo acumulado.
- Modos: proyectado, real y comparacion.
- Celdas enlazan a Movimientos filtrados por fecha y cuenta.
- No se permite edicion directa desde calendario.

### Senales visuales

- Montos en formato CLP.
- Ingresos, egresos, saldos y alertas usan icono y texto/tooltip, no solo color.
- Pendientes y pagados se reflejan mediante el modo proyectado/real.

### Rendimiento

- Una carga agregada por rango y filtros.
- Sin consultas por celda.
- Tabla con desplazamiento horizontal; virtualizacion queda reservada si el volumen lo exige.
