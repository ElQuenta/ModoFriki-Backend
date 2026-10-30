# ModoFriki Backend

API de **ModoFriki**, una biblioteca de cómics, manhwas, mangas y novelas en español. La consume [ModoFriki-Web](https://github.com/ElQuenta/ModoFriki-Web).

## Stack

- Node.js + Express 5 + TypeScript (CommonJS).
- PostgreSQL con Prisma 7 (usuarios, catálogo, lectura): fuente de verdad.
- MongoDB con Mongoose (comunidad: comentarios, votos y reportes).
- Multer + Vercel Blob para imágenes, con un pipeline de middlewares.
- Joi para validación, JWT + bcrypt para auth, Vitest para unit tests.

## Empezar

```bash
npm install
cp .env.example .env      # completa DATABASE_URL, MONGODB_URI, JWT_SECRET...
npx prisma generate       # obligatorio tras clonar (src/generated/ no se versiona)
npm run dev               # http://localhost:3000
```

- `GET /health`: estado del servidor. Documentación interactiva en `GET /api/docs` (desde `openapi.yaml`).
- MongoDB necesita **replica set** (la comunidad usa transacciones).

## Scripts

| Script | Descripción |
| --- | --- |
| `npm run dev` | Servidor con recarga (nodemon + tsx). |
| `npm run build` / `npm start` | Compila a `dist/` y arranca. |
| `npm test` | Unit tests (Vitest), sin bases reales. |
| `npm run test:env:up` / `test:env:server` / `test:env:down` | Entorno desechable en Docker para pruebas. |
| `npm run test:api` | Colección Postman con newman (ver [`postman/README.md`](postman/README.md)). |
| `npm run prisma:deploy` | Aplica las migraciones SQL de `prisma/migrations/`. |
| `npm run prisma:seed` | Crea o restaura el ADMIN inicial. |

## Base de datos

El esquema se cambia **solo con migraciones SQL aditivas** en `prisma/migrations/` (ver [`prisma/README.md`](prisma/README.md)), aplicadas con `npx prisma migrate deploy`. Nunca `db push`, `migrate dev` ni `migrate reset`: la base de Render es compartida y no tiene shadow DB.

Para probar, no uses la base compartida: `npm run test:env:up` levanta Postgres y Mongo desechables con datos fijos.

## Documentación

| Qué | Dónde |
| --- | --- |
| Contrato con el frontend | [`docs/API.md`](docs/API.md) y [`openapi.yaml`](openapi.yaml) |
| Arquitectura y reglas para agentes de IA | [`AGENTS.md`](AGENTS.md) y [`CLAUDE.md`](CLAUDE.md) |
| Pruebas de API | [`postman/README.md`](postman/README.md) |
| Decisiones, dominio y mejoras | Vault de Obsidian `Obsidian-ModoFriki/ModoFriki` (carpeta hermana de los repos; empieza por `ModoFriki - Mapa`) |

## Arquitectura (resumen)

Monolito en capas por dominio (`auth`, `catalog`, `community`, `reading`, `discovery`):

```txt
src/
  routes/        # endpoints y orden de middlewares
  controllers/   # extraen req y responden con los handlers
  services/      # reglas de negocio
  repositories/  # única capa con Prisma o Mongoose
  models/        # schemas Mongoose (comunidad)
  middlewares/   # auth, roles, validación, pipeline multimedia
  config/        # env y conexiones
```

Detalle y convenciones en [`CLAUDE.md`](CLAUDE.md).

## Git

Una rama `feat/*` o `fix/*` por cambio, que sale de `dev` y vuelve con merge `--no-ff`. A `main` y `qa` solo se llega por merge revisado.
