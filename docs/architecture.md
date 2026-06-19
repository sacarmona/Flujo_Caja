# Arquitectura — Flujo de Caja ADENTU Ingeniería SpA

> Este documento describe la implementación real en la rama `consolidacion-cash-flow`
> (base `cash_flow` + Fases A/B/C del plan de consolidación: gobernanza, auth por
> contraseña, feriados/adjuntos/conciliación). Reemplaza una versión anterior que
> describía un diseño descartado (NextAuth, modelo `Account`/`Counterparty`,
> `RecurrenceOccurrence`) y que nunca se implementó.

## 1. Visión general

Aplicación web interna para registrar, proyectar, consultar y conciliar los ingresos y
egresos de ADENTU Ingeniería SpA, reemplazando gradualmente la planilla de control actual
(`data/import/2026-06-17-cuenta-rapida-v2.xlsx`, usada solo como referencia).

```
Next.js 15 (App Router, TS estricto)
 ├─ src/app
 │   ├─ (auth)/login/      → login por correo/contraseña (server action)
 │   └─ app/                → rutas protegidas: recurrentes, movimientos,
 │                            calendario, configuracion, conciliacion
 ├─ src/lib
 │   ├─ prisma.ts            → cliente Prisma singleton
 │   ├─ auth.ts               → sesiones por cookie (sin NextAuth)
 │   ├─ holidays-cl.ts        → feriados chilenos (lectura desde tabla Holiday)
 │   ├─ recurrences.ts        → motor de recurrencias (funciones puras, sin DB)
 │   ├─ recurrence-service.ts → persistencia de ocurrencias (usa recurrences.ts)
 │   ├─ cash-flow.ts          → cálculo puro de flujo de caja proyectado/real
 │   ├─ cash-flow-service.ts  → carga de datos para cash-flow.ts
 │   └─ exchange-rates.ts     → interfaz ExchangeRateProvider + implementaciones
 └─ prisma/
     ├─ schema.prisma         → modelo de datos completo
     └─ seed.mjs              → datos de demostración (ADENTU, feriados, usuarios)
```

## 2. Decisiones de arquitectura

- **Next.js App Router + TypeScript estricto**: Server Components por defecto, server
  actions con validación de permisos centralizada en `src/lib/*.ts` (no en componentes).
- **PostgreSQL + Prisma**: tipado fuerte del esquema, migraciones versionadas (`migrate
  deploy` en producción, nunca `migrate dev`), `Decimal` para todos los montos.
- **Auth propia por cookie de sesión, no NextAuth**: login con correo + contraseña
  (`bcryptjs`), token de sesión aleatorio cuyo hash SHA-256 se guarda en la tabla
  `Session`; cookie `httpOnly` (`AUTH_COOKIE_NAME`, por defecto `adentu_session`). El rol
  viaja en la fila de `User`, nunca en el cliente — **toda autorización real se revalida
  en el servidor** dentro de cada server action (`assertCanManageRecurrences`,
  `assertCanModifyMovements`, `assertAdminRole`), nunca solo ocultando un botón en la UI.
- **Motor de recurrencias como funciones puras** (`src/lib/recurrences.ts`): no toca la
  base de datos; recibe `holidays: string[]` (claves `YYYY-MM-DD`) como parámetro para
  saltar días no hábiles, en vez de calcularlos internamente. La capa de persistencia
  (`recurrence-service.ts`) llama `getHolidayKeys(prisma)` (`src/lib/holidays-cl.ts`)
  antes de invocar el motor — **cualquier nuevo punto de generación de fechas debe hacer
  lo mismo**, de lo contrario solo se excluyen fines de semana, no feriados reales.
- **Feriados como tabla (`Holiday`), no API externa en cada cálculo**: se siembran una
  vez (`prisma/seed.mjs`, 30 feriados 2025-2026) para que los cálculos históricos no
  cambien si una fuente externa cambia. Soporta feriados manuales (`isManual = true`)
  agregados por ADMIN a futuro.
- **Fechas locales, no UTC**: las fechas de negocio (`Holiday.date`, fechas de
  recurrencia) se construyen con `new Date(year, month - 1, day)` (hora local), nunca con
  `new Date("YYYY-MM-DD")` (que parsea como UTC medianoche y se desfasa un día al leerse
  con métodos locales en `America/Santiago`). Ver `localDateFromISO` en
  `prisma/seed.mjs` y el mismo patrón en `src/lib/recurrences.ts`.
- **Montos siempre positivos**; el signo lo determina `Movement.type` (`INCOME`/`EXPENSE`).
- **Documentos adjuntos fuera de PostgreSQL**: el modelo `Attachment` guarda solo
  metadata y una `storageKey`; el binario va a almacenamiento configurable
  (`ATTACHMENTS_*` en `.env.example`). **Modelo agregado en Fase C — todavía sin UI ni
  lógica de subida/descarga.**
- **Conciliación bancaria con modelos propios** (`BankImportBatch`, `BankImportRow`,
  `BankMovement`, `Reconciliation`), separados de `Movement`/`Payment`, para no mezclar
  el movimiento contable proyectado con la cartola bancaria real. **Modelos agregados en
  Fase C — todavía sin UI ni lógica de importación/matching.**

## 3. Convención de nombres: inglés vs. español (Fase E)

El código (modelos Prisma, campos, server actions, funciones) está en **inglés**; la UI,
rutas y documentación están en **español**, siguiendo la convención que ya traía la base
`cash_flow`. No se ha renombrado nada para minimizar el diff de la consolidación. Tabla de
equivalencias para evitar confusión al leer schema vs. pantallas:

| Inglés (código) | Español (UI / negocio) |
|---|---|
| `Movement` | Movimiento |
| `MovementType.INCOME` / `EXPENSE` | Ingreso / Egreso |
| `MovementStatus.PROJECTED` | Proyectado |
| `MovementStatus.PENDING` | Pendiente |
| `MovementStatus.PARTIALLY_PAID` | Pagado parcialmente |
| `MovementStatus.PAID_OR_COLLECTED` | Pagado / Cobrado |
| `MovementStatus.OVERDUE` | Vencido |
| `MovementStatus.CANCELLED` | Cancelado |
| `RecurrenceRule` | Recurrencia |
| `AccountingAccount` | Cuenta contable (plan de cuentas) |
| `BusinessUnit` | Unidad de Negocio (UN) |
| `BankAccount` | Cuenta bancaria |
| `OpeningBalance` | Saldo inicial |
| `Payment` | Pago |
| `Attachment` | Documento adjunto |
| `BankImportBatch` / `BankImportRow` | Lote de importación de cartola / fila importada |
| `BankMovement` | Movimiento bancario (de la cartola, no contable) |
| `Reconciliation` | Conciliación |
| `Holiday` | Feriado |
| `ExchangeRate` | Tipo de cambio |
| `AuditLog` | Bitácora de auditoría |
| `Role.ADMIN` / `FINANCE` / `MOVEMENT_ENTRY` / `READ_ONLY` | Administrador / Finanzas / Ingreso de movimientos / Solo lectura |

Las rutas (`/app/recurrentes`, `/app/movimientos`, `/app/calendario`,
`/app/configuracion`, `/app/conciliacion`) y los mensajes de error de las server actions
están en español; los nombres de archivo, funciones y tipos están en inglés. Mantener
este patrón en código nuevo: **no mezclar idiomas dentro de un mismo identificador**
(evitar `crearMovement` o `Movimiento.create`).

## 4. Modelo de datos (resumen)

```
Company 1───* User 1───* Session
Company 1───* BusinessUnit 1───* Project
Company 1───* CostCenter
Company 1───* BankAccount 1───* OpeningBalance
Company 1───* AccountingAccount (jerárquico, self-relation parentId)
Company 1───* Movement ───* Payment
                  │ \           \
                  │  *─ Attachment ─* Attachment
                  │
                  *── RecurrenceRule ───* Movement
Company 1───* BankImportBatch 1───* BankImportRow
BankImportBatch 1───* BankMovement 1─1 Reconciliation ─ Movement / Payment
Company 1───* AuditLog (entidad genérica, referencia por entity + entityId)
Holiday (feriados sembrados + manuales de ADMIN, tabla global, no por Company)
Company 1───* ExchangeRate (histórico de tipos de cambio por moneda y fecha)
```

Detalle completo y actualizado en [`prisma/schema.prisma`](../prisma/schema.prisma).

### Reglas clave reflejadas en el esquema

- Todo `Movement` requiere una `AccountingAccount` con `allowMovements = true` — no se
  permite contabilizar contra cuentas resumen (con hijos).
- `BusinessUnit` es obligatoria en `Movement`/`RecurrenceRule`; "Sin asignar" es el valor
  por defecto cuando no hay asignación real. `Project` y `CostCenter` son opcionales.
- Moneda distinta de CLP: `Movement` guarda moneda y monto original, tasa proyectada,
  monto proyectado en CLP, fuente del tipo de cambio e indicador + motivo de corrección
  manual (`isManualRate`/`manualRateReason`).
- `Payment` es una entidad separada de `Movement` (no un booleano "pagado"), permitiendo
  pagos parciales; el estado pasa a `PARTIALLY_PAID` y luego `PAID_OR_COLLECTED` según la
  suma de pagos asociados (ver `src/lib/payments.ts`).
- Nada se borra físicamente: `cancelledAt`, `deactivatedAt`, `deletedAt`, `isActive`. Los
  registros cancelados/desactivados conservan su historial completo.
- `AuditLog` es de solo inserción y referencia genérica por `entity` + `entityId`; se
  escribe explícitamente en cada server action de mutación (recurrencias, movimientos,
  plan de cuentas) — **no es automático a nivel de Prisma**, así que cualquier nueva
  mutación debe agregar su propia llamada a `prisma.auditLog.create`.

## 5. Roles y permisos

Verificaciones reales en código (no aspiracionales):

| Permiso | ADMIN | FINANCE | MOVEMENT_ENTRY | READ_ONLY |
|---|---|---|---|---|
| Administrar plan de cuentas (`assertAdminRole`) | ✅ | ❌ | ❌ | ❌ |
| Administrar recurrencias (`assertCanManageRecurrences`) | ✅ | ✅ | ❌ | ❌ |
| Crear/editar/cancelar movimientos y pagos (`assertCanModifyMovements`) | ✅ | ✅ | ✅ | ❌ |
| Consultar (calendario, movimientos, recurrentes) | ✅ | ✅ | ✅ | ✅ |
| Administrar usuarios y roles | — | — | — | — |

La verificación se ejecuta siempre en el servidor (`src/lib/*.ts`); la UI solo oculta
controles como mejora de experiencia.

> **Administración de usuarios: no existe todavía.** No hay página ni server action para
> crear usuarios o cambiar roles — los únicos usuarios son los sembrados por
> `prisma/seed.mjs` (`admin@adentu.cl`, `finanzas@adentu.cl`). Cualquier cambio de rol hoy
> se hace editando la base de datos directamente, **sin quedar en `AuditLog`**. Esto es
> una brecha real (Fase D del plan de consolidación queda bloqueada por esto: no hay
> nada que auditar todavía). Implementar antes de dar acceso a más de los 2 usuarios
> demo.

## 6. Motor de recurrencias y flujo de caja

- `src/lib/recurrences.ts`: funciones puras que calculan ocurrencias futuras de una
  `RecurrenceRule` dado `frequency`, `intervalDays`/`dayOfMonth`/`dayOfWeek` y la lista de
  `holidays` (claves de fecha a excluir). Sin acceso a base de datos — testeable de forma
  aislada (`recurrences.test.ts`).
- `src/lib/recurrence-service.ts` (`generateMovementsForRecurrence`): capa de
  persistencia. Llama `getHolidayKeys(prisma)`, ejecuta el motor puro, y crea/actualiza
  `Movement` dentro de una transacción usando `@@unique([recurrenceRuleId,
  recurrenceOccurrenceDate])` para evitar duplicar ocurrencias aunque se recalcule el
  horizonte (`months: 12` por defecto).
- `src/lib/cash-flow.ts` / `cash-flow-service.ts`: cálculo puro de flujo de caja
  (proyectado/real/comparación) consumido por `/app/calendario`, también recibiendo
  `holidays` para excluir columnas no hábiles.
- `src/lib/exchange-rates.ts`: interfaz `ExchangeRateProvider` con dos implementaciones —
  `StaticExchangeRateProvider` (tasas fijas, pruebas) y `DatabaseExchangeRateProvider`
  (lee tabla `ExchangeRate`, usada en `recurrentes/actions.ts`). **No existe todavía** un
  proveedor que consulte `mindicador.cl` automáticamente; sin tasas cargadas a mano, los
  movimientos en UF/USD/EUR fallan al generarse.

## 7. Pendiente

- UI y lógica de negocio para `Attachment` (subir/descargar documentos).
- UI y lógica de negocio para conciliación bancaria (`BankImportBatch` → matching →
  confirmación contra `Movement`/`Payment`).
- Administración de usuarios y roles (con su propio registro en `AuditLog`).
- Implementación de `ExchangeRateProvider` contra `mindicador.cl`.
- Vista semanal (mencionada en la especificación original, no iniciada).
- Fusión de `consolidacion-cash-flow` a `master` una vez cerrados los puntos anteriores.
