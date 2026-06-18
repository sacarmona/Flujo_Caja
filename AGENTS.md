# AGENTS.md

## Proyecto

Aplicacion web de flujo de caja para ADENTU Ingeniería SpA.

## Stack

- Next.js App Router
- TypeScript estricto
- PostgreSQL
- Prisma
- Tailwind CSS
- Vitest
- ESLint

## Convenciones

- Formato local: `es-CL`
- Zona horaria: `America/Santiago`
- Moneda base: `CLP`
- Empresa unica: `ADENTU Ingeniería SpA`
- Monedas permitidas: `CLP`, `UF`, `EUR`, `USD`
- Roles: `ADMIN`, `FINANCE`, `MOVEMENT_ENTRY`, `READ_ONLY`

## Verificacion

Antes de terminar cambios relevantes, ejecutar:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
