# Arquitectura — Flujo de Caja ADENTU Ingeniería SpA

## 1. Visión general

Aplicación web interna para registrar, proyectar, consultar y conciliar los ingresos y
egresos de ADENTU Ingeniería SpA, reemplazando gradualmente la planilla de control actual
(`data/import/2026-06-17-cuenta-rapida-v2.xlsx`, usada solo como referencia).

```
Next.js (App Router, TS estricto)
 ├─ src/app          → rutas, server actions, route handlers
 ├─ src/lib
 │   ├─ prisma.ts     → cliente Prisma singleton
 │   ├─ auth/         → NextAuth + matriz de permisos por rol
 │   ├─ calendar/     → BusinessCalendar, feriados CL, utilidades de fecha UTC
 │   └─ recurrence/   → motor de recurrencias (funciones puras, sin DB)
 └─ src/types         → augmentations de tipos (next-auth, etc.)
prisma/
 ├─ schema.prisma     → modelo de datos completo
 └─ seed.ts           → datos de demostración
```

## 2. Decisiones de arquitectura

- **Next.js App Router + TypeScript estricto**: permite Server Components por defecto
  (menos JS al cliente) y server actions con validación de permisos centralizada.
- **PostgreSQL + Prisma**: tipado fuerte del esquema, migraciones versionadas, soporte
  nativo de `Decimal` para montos (nunca `number` de punto flotante).
- **NextAuth (credentials + JWT)**: autenticación simple por correo/contraseña sin
  dependencias externas; el rol se incluye en el JWT/sesión pero **toda autorización real
  se revalida en el servidor** (`src/lib/auth/permissions.ts`), nunca solo en la UI.
- **Motor de recurrencias como funciones puras** (`src/lib/recurrence/engine.ts`): no toca
  la base de datos, por lo que se puede testear exhaustivamente sin fixtures de DB. La capa
  de persistencia (fase posterior) se encarga de materializar `RecurrenceOccurrence` →
  `Movement` dentro de una transacción, usando `idempotencyKey` para evitar duplicados.
- **`BusinessCalendar`** desacopla la noción de "día hábil" de la fuente de feriados. La
  implementación actual usa una copia local versionada (`holidays-cl.ts`) en lugar de una
  API externa, para que los cálculos históricos no cambien si la fuente cambia. Está
  diseñada para aceptar días no laborables manuales agregados por ADMIN.
- **Fechas como "fecha de calendario"**: todas las fechas de negocio se manejan como
  `Date` en UTC a medianoche (`dateOnlyUTC`), nunca con hora local, para evitar
  desplazamientos de día al cruzar zonas horarias. La zona horaria de visualización de la
  aplicación es `America/Santiago`.
- **Montos siempre positivos**; el signo lo determina `Movement.type` (`INGRESO`/`EGRESO`).
- **Documentos adjuntos fuera de PostgreSQL**: se guarda solo metadata (`Attachment`) y una
  `storageKey`; el binario va a un almacenamiento de archivos (configurable, ver
  `.env.example`).

## 3. Modelo de datos (resumen)

```
Company 1───* User
Company 1───* BusinessUnit 1───* Project
Company 1───* CostCenter
Company 1───* Counterparty
Company 1───* BankAccount 1───* InitialBalance
Company 1───* Account (jerárquico, self-relation parentId)
Company 1───* Movement ───* Payment
                  │ \
                  │  *─ Attachment
                  │
                  *── RecurrenceRule 1───* RecurrenceOccurrence ─1 Movement
BankImportBatch 1───* BankImportRow
BankImportBatch 1───* BankMovement 1─1 Reconciliation ─ Movement / Payment
AuditLog (entidad genérica, referencia por entity + entityId)
Holiday (días no laborables manuales / overrides de ADMIN)
ExchangeRate (histórico de tipos de cambio por moneda y fecha)
```

Detalle completo en [`prisma/schema.prisma`](../prisma/schema.prisma).

### Reglas clave reflejadas en el esquema

- Todo `Movement` requiere una `Account` (`allowsMovements = true`) — no se permite
  contabilizar contra cuentas resumen.
- `BusinessUnit` es obligatoria en `Movement`/`RecurrenceRule`; "Sin asignar" es el valor
  por defecto cuando no hay asignación real. `Project` y `CostCenter` son opcionales.
- Moneda distinta de CLP: el modelo `Movement` guarda moneda y monto original, fecha/tipo
  de cambio proyectado y real, monto proyectado/real en CLP, fuente del tipo de cambio e
  indicador + motivo de corrección manual — tal como exige la especificación.
- `Payment` es una entidad separada de `Movement` (no un booleano "pagado"), permitiendo
  pagos parciales; el estado de pago se deriva sumando pagos asociados.
- `RecurrenceOccurrence.idempotencyKey` es único — evita generar la misma ocurrencia dos
  veces aunque el horizonte de generación se recalcule.
- Nada se borra físicamente: los modelos usan `active`/`status` para desactivación lógica.
  `AuditLog` es un historial de solo inserción.

## 4. Roles y permisos

Matriz completa en [`src/lib/auth/permissions.ts`](../src/lib/auth/permissions.ts). Resumen:

| Permiso | ADMIN | FINANCE | MOVEMENT_ENTRY | READ_ONLY |
|---|---|---|---|---|
| Administrar usuarios | ✅ | ❌ | ❌ | ❌ |
| Administrar UN/proyectos/CC/cuentas/cuentas bancarias | ✅ | ❌ | ❌ | ❌ |
| Administrar recurrencias | ✅ | ✅ | ❌ | ❌ |
| Importar cartolas | ✅ | ✅ | ❌ | ❌ |
| Confirmar conciliaciones | ✅ | ✅ | ❌ | ❌ |
| Exportar información | ✅ | ✅ | ❌ | ❌ |
| Crear/editar movimientos | ✅ | ✅ | ✅ (con límites) | ❌ |
| Consultar auditoría | ✅ | ❌ | ❌ | ❌ |
| Solo lectura | ✅ | ✅ | ✅ | ✅ |

La verificación se ejecuta siempre en el servidor (`assertPermission`); la UI solo oculta
controles como mejora de experiencia, nunca como control de seguridad.

## 5. Motor de recurrencias

Ver [`src/lib/recurrence/engine.ts`](../src/lib/recurrence/engine.ts) y sus pruebas en
[`engine.test.ts`](../src/lib/recurrence/engine.test.ts). Flujo:

1. Se calculan fechas teóricas ("raw") según frecuencia e intervalo.
2. Si el día de mes (29/30/31) no existe en el mes destino, se usa el último día del mes.
3. Se aplica el ajuste por día no hábil (`BusinessCalendar.nextBusinessDay`).
4. Se calcula `idempotencyKey = ruleId:fechaTeórica` — estable ante recálculos.
5. Overrides `SINGLE` (una sola ocurrencia) y `FORWARD` (esta y las siguientes) se aplican
   sin modificar ocurrencias anteriores.

La persistencia de ocurrencias (crear/actualizar `RecurrenceOccurrence` + `Movement` dentro
de una transacción, horizonte móvil de 12 meses) se implementará en una fase posterior
sobre esta base pura.

## 6. Pendiente para fases siguientes

- Vistas 1, 2 y 3 (recurrentes/configuración, calendario de flujo de caja, semanal).
- Conciliación bancaria (importación, matching, confirmación).
- Asistente de importación desde la planilla actual.
- Implementación de `ExchangeRateProvider` contra fuente de indicadores chilenos.
- Persistencia transaccional del motor de recurrencias y generación del horizonte móvil.
- Almacenamiento real de adjuntos y políticas de descarga por permisos.
