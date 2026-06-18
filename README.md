# Flujo de Caja — ADENTU Ingeniería SpA

Aplicación web interna para registrar, proyectar, consultar y conciliar los ingresos y
egresos de ADENTU Ingeniería SpA. Reemplaza gradualmente la planilla de control actual.

Ver [`AGENTS.md`](./AGENTS.md) para las reglas técnicas obligatorias y
[`docs/architecture.md`](./docs/architecture.md) para el diseño completo.

## Stack

Next.js (App Router) · TypeScript estricto · PostgreSQL · Prisma · Tailwind CSS · NextAuth ·
Zod · Vitest · Playwright · ESLint.

Zona horaria: `America/Santiago`. Formato regional: `es-CL`. Moneda base: `CLP`.

## Requisitos previos

- Node.js 20+
- PostgreSQL 15+ (local o remoto)

## Instalación

```bash
npm install
cp .env.example .env
# Editar .env con la URL real de PostgreSQL y un NEXTAUTH_SECRET generado con:
# openssl rand -base64 32
```

## Base de datos

```bash
npm run prisma:migrate     # crea/aplica migraciones en desarrollo
npm run prisma:seed        # carga datos de demostración (empresa, plan de cuentas, usuarios demo)
```

Usuarios de demostración creados por el seed (contraseña `ChangeMe123!`, **no usar en
producción**):

- `admin@adentu.cl` — rol ADMIN
- `finanzas@adentu.cl` — rol FINANCE

## Ejecutar en desarrollo

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000) e iniciar sesión en `/login`.

## Pruebas

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm run test        # pruebas unitarias (Vitest) — motor de recurrencias, permisos
npm run test:e2e    # pruebas Playwright (requiere build previo)
```

## Build de producción

```bash
npm run build
npm run start
```

## Importación de la planilla de referencia

La planilla `2026-06-17-cuenta-rapida-v2.xlsx` se guarda en `data/import/` solo como
referencia histórica. No se modifica ni se depende de su estructura exacta: el asistente de
importación (fase posterior) está diseñado para tolerar cambios de estructura.

## Estado del proyecto

Fase 1 completada: estructura base, modelo de datos completo, autenticación y roles,
motor de recurrencias con pruebas unitarias, plan de cuentas y datos de demostración.
Las vistas de calendario, semanal y de conciliación se implementarán en fases posteriores
(ver "Pendiente para fases siguientes" en `docs/architecture.md`).
