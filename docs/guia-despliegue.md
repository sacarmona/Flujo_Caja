# Guía de despliegue y primeras pruebas

Esta guía cubre cómo levantar el proyecto desde cero (desarrollo local) y cómo
desplegarlo en un entorno real, además de un checklist de primeras pruebas
manuales. Refleja el estado de la rama `consolidacion-cash-flow` (Fases A, B y
C del plan de consolidación ya aplicadas: base `cash_flow`, auth por
usuario/contraseña, feriados reales, modelos de adjuntos y conciliación).

> Antes de desplegar a producción, revisar la sección **"Pendientes antes de
> producción"** al final de este documento — hay puntos bloqueantes (saldo
> inicial real, contraseñas demo, secretos de sesión).

---

## 1. Requisitos previos

- Node.js 20+ (recomendado 22 LTS).
- PostgreSQL 15+ (local o gestionado).
- Acceso a un repositorio Git (GitHub `sacarmona/Flujo_Caja`, rama
  `consolidacion-cash-flow` hasta que se fusione a `master`).

---

## 2. Preparar el entorno local

```bash
git clone https://github.com/sacarmona/Flujo_Caja.git
cd Flujo_Caja
git checkout consolidacion-cash-flow
npm install
```

### 2.1 Variables de entorno

```bash
cp .env.example .env
```

Editar `.env`:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión PostgreSQL | `postgresql://postgres:TU_CLAVE@localhost:5432/flujo_caja?schema=public` |
| `APP_URL` | URL pública de la app | `http://localhost:3000` |
| `AUTH_COOKIE_NAME` | Nombre de la cookie de sesión | `adentu_session` (dejar por defecto) |
| `SESSION_TTL_DAYS` | Duración de la sesión en días | `7` |
| `BASE_CURRENCY`, `APP_TIME_ZONE`, `APP_LOCALE` | Configuración regional | `CLP`, `America/Santiago`, `es-CL` (no cambiar) |
| `OPENING_BALANCE_CLP` | Saldo inicial real de Cuenta Corriente Santander | **dejar vacío hasta tener el monto real** — no inventar |
| `OPENING_BALANCE_DATE` | Fecha del saldo inicial | Solo si se define `OPENING_BALANCE_CLP` |
| `EXCHANGE_RATE_API_URL` | Fuente de indicadores chilenos (UF/USD/EUR) | `https://mindicador.cl/api` |
| `ATTACHMENTS_*` | Almacenamiento de adjuntos (modelo agregado en Fase C, sin UI todavía) | valores por defecto sirven para desarrollo |

> `AUTH_COOKIE_NAME`/`SESSION_TTL_DAYS` siguen siendo los nombres heredados de
> `cash_flow`; no se han renombrado para minimizar el diff de la
> consolidación.

### 2.2 Generar un `NEXTAUTH`-equivalente / secreto de sesión

Este proyecto no usa NextAuth: las sesiones se firman con un token aleatorio
guardado en la tabla `Session` (hash SHA-256), no con un secreto JWT
compartido. **No hay variable de secreto que generar** — solo asegurarse de
que `AUTH_COOKIE_NAME` no choque con otra cookie del dominio si se despliega
junto a otra app.

---

## 3. Base de datos

### 3.1 Crear la base

```sql
CREATE DATABASE flujo_caja;
```

### 3.2 Aplicar migraciones

```bash
npx prisma migrate deploy
```

Esto aplica, en orden, las 9 migraciones existentes a la fecha:

1. `20260618152000_initial_cash_flow_domain`
2. `20260618154000_accounting_account_hierarchy`
3. `20260618161000_movement_entry_fields`
4. `20260618163000_payment_cancellation_fields`
5. `20260618170000_movement_exchange_conversion`
6. `20260618173000_recurrence_rules`
7. `20260618180000_recurrence_rule_schedule_fields`
8. `20260619030537_add_password_auth`
9. `20260619032313_add_holidays_attachments_reconciliation`

> Si la base ya existía con un esquema previo (por ejemplo, de una rama
> anterior de este mismo proyecto), **no usar `migrate deploy` sobre datos
> existentes incompatibles** — recrear la base desde cero con `DROP DATABASE`
> + `CREATE DATABASE` antes del paso anterior.

### 3.3 Cargar datos de demostración

```bash
npm run db:seed
```

Esto crea:

- Empresa **ADENTU Ingeniería SpA** (`CLP`, `es-CL`, `America/Santiago`).
- 6 Unidades de Negocio: Inspecciones, TVM, Saesa, Plataforma, Casa Matriz, Sin asignar.
- Cuenta Corriente Santander (`CLP`).
- Plan de cuentas jerárquico completo.
- 30 feriados chilenos 2025-2026.
- 2 usuarios de demostración:

| Correo | Rol | Contraseña |
|---|---|---|
| `admin@adentu.cl` | ADMIN | `ChangeMe123!` |
| `finanzas@adentu.cl` | FINANCE | `ChangeMe123!` |

> **`ChangeMe123!` no es una contraseña real** — solo para desarrollo/QA.
> Cambiarla (o eliminar estos usuarios y crear los reales) antes de dar acceso
> a producción a cualquier persona.

No se crea saldo inicial salvo que se haya definido `OPENING_BALANCE_CLP` en
`.env` antes de sembrar — esto es intencional (no se inventa el monto real).

---

## 4. Ejecutar en desarrollo

```bash
npm run dev
```

Abrir `http://localhost:3000` (o el puerto que indique la consola si 3000 ya
está ocupado).

---

## 5. Verificación antes de cualquier entrega (obligatorio)

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Los cuatro deben terminar sin errores. `build` y `test` ejecutan
`prisma generate` automáticamente; `typecheck` no lo hace — si se ve un error
de tipos relacionado a `Prisma`/`Decimal`/enums, correr `npx prisma generate`
manualmente primero.

---

## 6. Checklist de primeras pruebas manuales

Con el servidor de desarrollo corriendo y el seed cargado:

1. **Login**
   - Ir a `/login`.
   - Ingresar `admin@adentu.cl` / `ChangeMe123!` → debe redirigir a `/app`.
   - Probar con contraseña incorrecta → debe mostrar "Correo o contrasena
     incorrectos." sin redirigir.
2. **Cierre de sesión**
   - Verificar que exista un control de logout (POST a `/api/auth/sign-out`)
     y que tras usarlo, `/app` redirija de nuevo a `/login`.
3. **Recurrentes** (`/app/recurrentes`)
   - Con el usuario ADMIN o FINANCE, crear una recurrencia mensual de
     prueba.
   - Confirmar que la vista previa de próximas ocurrencias **salta
     correctamente sábados, domingos y feriados chilenos** (probar con una
     fecha de inicio cercana a un feriado sembrado, ej. `2025-09-15` para
     ver el salto por Fiestas Patrias).
   - Generar movimientos desde una recurrencia y confirmar que aparecen en
     Movimientos.
   - Con el usuario READ_ONLY (crear uno manualmente o cambiar el rol del
     seed), confirmar que **no** puede crear/editar recurrencias.
4. **Calendario** (`/app/calendario`)
   - Cambiar el horizonte entre 3/6/9/12 meses.
   - Cambiar el modo proyectado/real/comparación.
   - Confirmar que las columnas excluyen fines de semana y feriados.
   - Hacer clic en una celda y confirmar que enlaza a Movimientos filtrado
     por esa fecha/cuenta.
5. **Movimientos** (`/app/movimientos`)
   - Crear un ingreso y un egreso manual.
   - Registrar un pago parcial sobre un movimiento y confirmar que el
     estado pasa a `PARTIALLY_PAID` y luego a `PAID_OR_COLLECTED` al
     completarlo.
6. **Permisos por rol**
   - Repetir las pruebas de creación/edición con cada rol (`ADMIN`,
     `FINANCE`, `MOVEMENT_ENTRY`, `READ_ONLY`) y confirmar que las
     restricciones se aplican **en el servidor** (probar también llamando
     a la server action directamente, no solo ocultando el botón en la
     UI).
7. **Datos no destructivos**
   - Cancelar un movimiento y confirmar que no se borra físicamente
     (`cancelledAt` se completa, el registro sigue existiendo).
   - Desactivar una recurrencia con movimientos ya generados y confirmar
     que el historial se conserva.

---

## 7. Despliegue a un entorno real

### Opción recomendada: Vercel (app) + PostgreSQL gestionado (Neon, Supabase, RDS, etc.)

1. Crear la base de datos gestionada y obtener su `DATABASE_URL` (con
   `sslmode=require` si el proveedor lo exige).
2. Conectar el repositorio a Vercel, seleccionando la rama a desplegar.
3. Configurar las variables de entorno de la sección 2.1 en el panel de
   Vercel (Production y Preview por separado si se usan ambos).
4. **Antes del primer despliegue**, correr las migraciones contra la base de
   producción desde un entorno con acceso de red a ella:
   ```bash
   DATABASE_URL="<url-de-produccion>" npx prisma migrate deploy
   ```
   No usar `migrate dev` en producción — solo `migrate deploy`.
5. Desplegar. El comando de build (`npm run build`) ya incluye
   `prisma generate`.
6. Sembrar datos iniciales solo si la base de producción está vacía:
   ```bash
   DATABASE_URL="<url-de-produccion>" npm run db:seed
   ```
   **No correr el seed con contraseñas demo en producción** sin antes
   editar `prisma/seed.mjs` para usar credenciales reales o eliminar esos
   usuarios después.

### Alternativa: servidor propio (VPS) con PostgreSQL local

1. Instalar Node.js 20+, PostgreSQL 15+ y PM2 (o systemd) en el servidor.
2. Clonar el repositorio, `npm install`, configurar `.env`.
3. `npx prisma migrate deploy`.
4. `npm run build`.
5. `npm run start` (o gestionarlo con PM2/systemd para que se reinicie
   solo).
6. Configurar un proxy inverso (nginx/Caddy) con TLS hacia el puerto de
   Next.js.

---

## 8. Pendientes antes de producción

Estos puntos son bloqueantes o casi-bloqueantes para un uso real, no solo de
prueba:

- **Saldo inicial real**: no se ha definido. El cálculo de flujo de caja
  parte de `0` hasta que alguien configure `OPENING_BALANCE_CLP`/`DATE` y se
  reseed (o se inserte el `OpeningBalance` manualmente).
- **Usuarios y contraseñas reales**: los 2 usuarios demo usan
  `ChangeMe123!`. Reemplazar antes de dar acceso real.
- **Tipo de cambio**: `ExchangeRateProvider` tiene una implementación
  estática (`StaticExchangeRateProvider`) y una basada en `ExchangeRate` de
  la base de datos (`DatabaseExchangeRateProvider`, en
  `app/recurrentes/actions.ts`); no hay todavía un proveedor que consulte
  `mindicador.cl` automáticamente. Sin tasas cargadas manualmente, los
  movimientos en UF/USD/EUR fallarán al generarse.
- **Adjuntos y conciliación bancaria**: el modelo de datos existe (Fase C)
  pero no hay UI ni lógica de negocio para subir archivos ni importar
  cartolas todavía.
- **Auditoría de cambios de permisos**: confirmar que los cambios de rol de
  usuario quedan en `AuditLog` (pendiente de revisión en la Fase D del plan
  de consolidación).
- Esta rama (`consolidacion-cash-flow`) **no se ha fusionado a `master`**
  todavía — el despliegue automático desde GitHub debe apuntar
  explícitamente a esta rama hasta que se decida el merge.
