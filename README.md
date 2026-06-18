# cash_flow

Aplicacion web de flujo de caja para ADENTU Ingeniería SpA.

## Stack

- Next.js
- TypeScript
- PostgreSQL
- Prisma
- Tailwind CSS
- Vitest

## Configuracion

1. Copia `.env.example` a `.env`.
2. Ajusta `DATABASE_URL` con tus credenciales de PostgreSQL.
3. Opcionalmente define `OPENING_BALANCE_CLP` y `OPENING_BALANCE_DATE` para crear el saldo inicial de la Cuenta Corriente Santander.
4. Instala dependencias:

```bash
npm install
```

5. Genera el cliente Prisma:

```bash
npm run prisma:generate
```

6. Ejecuta seed si necesitas cargar datos iniciales:

```bash
npm run db:seed
```

7. Ejecuta la aplicacion:

```bash
npm run dev
```

## Scripts

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Dominio

- Empresa unica: ADENTU Ingeniería SpA.
- Locale: `es-CL`.
- Zona horaria: `America/Santiago`.
- Moneda base: `CLP`.
- Monedas permitidas: `CLP`, `UF`, `EUR`, `USD`.
- Roles: `ADMIN`, `FINANCE`, `MOVEMENT_ENTRY`, `READ_ONLY`.
