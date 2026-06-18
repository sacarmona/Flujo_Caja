# AGENTS.md — Reglas técnicas del repositorio Flujo_Caja

Este documento define las reglas técnicas obligatorias para cualquier persona o agente que
modifique este repositorio. Aplica a humanos y a asistentes de IA por igual.

## Propósito del proyecto

Aplicación web interna de flujo de caja para **ADENTU Ingeniería SpA**, que reemplaza
gradualmente la planilla de control financiero existente. Ver `docs/architecture.md` para el
diseño completo.

## Stack obligatorio

- Next.js (App Router) + TypeScript estricto (`strict: true`, sin `any` implícito).
- PostgreSQL + Prisma ORM (migraciones versionadas, nunca `db push` en producción).
- Tailwind CSS para estilos; componentes accesibles (roles ARIA, foco visible, contraste AA).
- NextAuth (credentials, email + contraseña con hash bcrypt) para autenticación.
- Zod para validación de datos, **siempre en cliente y servidor**.
- Vitest para pruebas unitarias; Playwright para pruebas críticas de interfaz.
- ESLint + Prettier (config de `eslint-config-next`).
- Zona horaria de negocio: `America/Santiago`. Formato regional: `es-CL`. Moneda base: `CLP`.

No usar paquetes en versión *beta* o *canary* salvo necesidad estrictamente justificada, y en
ese caso documentar el motivo en este archivo.

## Reglas de datos financieros (no negociables)

1. **Nunca borrar físicamente información financiera.** Usar `activo`/`deletedAt` (soft
   delete) o estados de cancelación. Los movimientos pagados/cobrados/conciliados nunca se
   eliminan, ni siquiera al desactivar la recurrencia que los generó.
2. **Auditoría obligatoria** en toda modificación de: fecha, monto, estado, moneda, cuenta
   contable, tipo de cambio, recurrencias, pagos, conciliaciones y permisos. Cada cambio debe
   registrar entidad, ID, acción, usuario, fecha/hora, campo, valor anterior, valor nuevo,
   motivo opcional e IP/sesión cuando esté disponible. Ver modelo `AuditLog`.
3. **Transacciones de base de datos** obligatorias en: registro de pagos/cobros, confirmación
   de conciliaciones y generación de ocurrencias de recurrencias. Usar
   `prisma.$transaction`.
4. **Montos siempre en `Decimal`** (Prisma `Decimal` / `decimal.js` en código). Prohibido usar
   `number` de punto flotante para dinero.
5. **Montos se guardan positivos.** El signo (ingreso/egreso) lo determina el campo `type` del
   movimiento, nunca el signo del monto.
6. **Fechas financieras son fechas de calendario**, no timestamps con zona horaria implícita.
   Evitar conversiones accidentales de zona horaria al guardar/leer fechas.

## Permisos

Todo permiso se valida **en el servidor** (route handlers / server actions), nunca solo
ocultando elementos de la interfaz. Ver `docs/architecture.md` para la matriz de roles
(ADMIN, FINANCE, MOVEMENT_ENTRY, READ_ONLY).

## Secretos

- Prohibido commitear secretos, claves o credenciales reales.
- Mantener `.env.example` actualizado con todas las variables necesarias, sin valores reales.
- `.env`, `.env.local` y similares están en `.gitignore`.

## Flujo de trabajo por fases

El proyecto se construye en fases verificables. Antes de cerrar cualquier fase:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Corregir todos los errores antes de informar que una fase está terminada. No avanzar a la
fase siguiente con errores pendientes sin documentarlos explícitamente como riesgo conocido.

## Convenciones de código

- Componentes de servidor por defecto; `"use client"` solo cuando se necesite interactividad.
- Lógica de negocio pura (cálculo de recurrencias, conversión de moneda, agregaciones) en
  funciones puras testeables, separadas de los componentes y de los route handlers.
- Nombrar archivos de Prisma models en PascalCase singular; tablas en snake_case vía
  `@@map`.
- No depender permanentemente de la estructura de la planilla Excel de referencia
  (`data/import/2026-06-17-cuenta-rapida-v2.xlsx`). Es solo material de referencia para el
  asistente de importación.

## Pruebas obligatorias

- Motor de recurrencias: meses de 28/29/30/31 días, años bisiestos, fines de semana,
  feriados, quincenal, modificación de una sola ocurrencia, modificación de "esta y las
  siguientes", desactivación sin pérdida de historial, prevención de duplicados.
- Cualquier regla de negocio financiera (cálculo de saldo, conciliación, pagos parciales)
  requiere prueba unitaria antes de integrarse a una vista.
