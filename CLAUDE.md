@AGENTS.md

# Solo para Claude Code

De `AGENTS.md` aplica todo: arquitectura, persistencia, pipeline multimedia, Git y contrato de entrega. Lo único que no aplica son las sesiones de Codex y los worktrees: en Claude los subagentes comparten carpeta y rama, por eso cada rol tiene **archivos propios disjuntos** (tabla de abajo) y se ejecutan en el orden que marca el skill.

- **Contrato:** `docs/API.md` (P1 = MVP de hoy). El frontend lo construye otra persona en otro repo contra ese contrato. No lo cambies sin el OK del usuario.
- **Referencia de estilo:** ElQuenta/TankoBase, citada en `AGENTS.md`.

## Comandos
- `npm run dev`: http://localhost:3000, con `GET /health` (y `GET /`).
- `npx prisma generate`: obligatorio tras clonar (`src/generated/` está en .gitignore).
- Esquema por **migraciones SQL** en `prisma/migrations/` (ver `prisma/README.md`). Las nuevas se escriben aditivas y a mano o con `prisma migrate diff`; se aplican con `npx prisma migrate deploy`. Nunca `migrate dev`/`reset` ni `db push` (Render no tiene shadow DB y la DB es compartida). `npx prisma db seed` crea solo el ADMIN.
- Para probar sin tocar la DB compartida: Postgres desechable en Docker y `DATABASE_URL=postgresql://…localhost…?sslmode=disable` en la variable de entorno del comando (dotenv no la pisa).
- `npx tsc --noEmit` y `npm run build`.
- `npm test`: Vitest (`vitest.config.ts`, variables de entorno ficticias). Tests en `src/<capa>/__tests__/<entidad>.<capa>.test.ts`, con repositorios y servicios externos mockeados; nunca la DB real. Los `__tests__` están excluidos de `tsconfig.json` (no van al build). No hay script de `lint`.
- `npm run media:cleanup` (dry-run) / `npm run media:cleanup -- --apply`: limpieza de imágenes huérfanas en Blob con `MediaCleanupJob` (detalle en `docs/API.md`). Nunca lo corras con `--apply` contra Render sin el OK del usuario.
- `npm run test:integration`: Vitest contra el Postgres desechable (`npm run test:env:up` antes). Tests en `src/**/__integration__/*.int.test.ts` para lo que los mocks no prueban: idempotencia de visitas/lecturas, una lectura por día local, número único de capítulo, 409 por versión y migraciones desde cero. Cada archivo crea sus propios datos; `src/__integration__/guard.ts` aborta si `DATABASE_URL` no es local.

## Arquitectura por capas (por dominio: `auth`, `catalog`, `community`, `reading`, `discovery`)
| Capa | Carpeta | Convención |
| --- | --- | --- |
| Routes | `src/routes/<dominio>.routes.ts` | Factory con dependencias inyectables: `export function createXRouter(service = xService, auth = authService): Router` + `export default createXRouter()`. Se montan en `src/app.ts` con `app.use("/api", …)` (las rutas literales como `/works/popular` van en un router montado antes de `catalogRouter`, que tiene `/works/:workId`) |
| Controllers | `src/controllers/<dominio>/<dominio>.controller.ts` | Clase que recibe el service; cada handler extrae `req.query/params/body` y `res.locals.user` y responde con `SuccessResponseHandler`/`ErrorResponseHandler`. Sin Prisma ni Mongoose |
| Services | `src/services/<dominio>/<dominio>.service.ts` | Clase con repositorio inyectable por constructor + `export const xService`. Valida la entrada con el helper Joi del dominio y envuelve en `run()` con `catchAndLogError`. Errores esperados: `new AppError("…", 4xx)`. Sin Request/Response ni Blob |
| Repositories | `src/repositories/<dominio>/*.ts` | Única capa con `prisma` o Mongoose (cliente inyectable). Devuelve formas del contrato (nunca `passwordHash`); `$queryRaw` solo con tagged template / `Prisma.sql`, nunca `Unsafe` |
| Models | `src/models/community/` | Solo Mongoose (comentarios, votos, reportes) |
| Validations | `src/middlewares/schemas/<dominio>.schema.ts` | Joi con `.unknown(false)` y helpers `validateX(schema, input)` que lanzan 400 |
| Types | `src/types/<dominio>.types.ts` | Formas de `data` y contratos de repositorio |

## Middlewares (`src/middlewares/`)
- `createAuthenticate(auth)` / `createOptionalAuthenticate(auth)` (`auth.middleware.ts`): Bearer JWT → `res.locals.user`; sin header, la versión opcional sigue como anónimo; token inválido → 401.
- `authorize(["ADMIN"])` (`role.middleware.ts`): 401 sin usuario, 403 sin rol.
- `validatebody`, `validateParams`, `validateQuery`: Joi con `abortEarly: false`, `convert: true`; 400 con `Validation error: …`. La mayoría de dominios valida en el service con su helper.
- `catalog.middleware.ts`: params, body, preflight y errores del pipeline de catálogo.
- Pipeline multimedia en `src/middlewares/media/` (`receive` → `validate`/`image-validation` → `upload` a Blob → `delete-replaced` tras el commit); tipos en `media/types.ts`.
- Los middlewares pueden lanzar `AppError`: el `errorHandler` de 4 argumentos de `src/app.ts` los convierte en JSON. No lo quites (sin él Express devuelve HTML con stack trace).
- Respuestas: `{ success, code, data }`. Paginados: `{ items, total, page, limit }` (community usa cursor: `{ items, hasMore, nextCursor }`). Documentación en `openapi.yaml` (raíz), servida en `/api/docs`.
- CORS restringido a `http://localhost:5173` y `FRONTEND_URL`.
- Estilo: comillas dobles, punto y coma, tabs, exports con nombre, imports sin extensión (CommonJS).

## Roles (subagentes en `.claude/agents/`) y archivos propios
| Rol | Edita | Cuándo |
| --- | --- | --- |
| `planner` | `docs/features/<feature>.md` | Al inicio de cada feature |
| `architect` | Nada (consulta) | Solo si hay una decisión estructural sin resolver |
| `db` | `prisma/schema.prisma`, `prisma/migrations/**`, `src/scripts/seed.ts`, `prisma.config.ts`, `src/config/database/**`, `src/models/**`, `src/repositories/**`, `src/types/<dominio>.types.ts` | Si la feature toca datos |
| `media` | `src/middlewares/media/**`, `src/utils/media-paths.ts` | Si la feature sube archivos |
| `dev` | `src/routes/**`, `src/controllers/**`, `src/services/**`, `src/middlewares/schemas/**`, `src/middlewares/{auth,role,catalog,validatebody,validateParams,validateQuery}.middleware.ts`, `src/types/express.d.ts`, `src/app.ts`, `openapi.yaml`, `package.json` | Siempre, después de `db` y `media` |
| `test` | Nada (prueba con curl) | Después de implementar |
| `tester-api` | Nada (colección Postman con newman + MCP `postman`) | En `/probar-backend` y `/corregir-backend` |
| (principal) | `**/__tests__/**`, `vitest.config.ts`, `docs/**`, `CLAUDE.md` | Unit tests y documentación |
| `reviewer` | Nada (revisa) | Antes de cada commit |
| `security` | Nada (audita) | En paralelo con `reviewer` si la feature toca auth, permisos, uploads o secretos |

Los hallazgos vuelven al **dueño del archivo**, nunca a otro rol. Si un archivo no aparece en la tabla, lo edita el agente principal.

Dependencias: cualquier rol puede instalar los `@types/*` que necesiten sus archivos (`npm i -D @types/multer`, por ejemplo). Las dependencias de runtime nuevas las agrega solo `dev`, justificándolo en su entrega; hoy no hay ninguna prevista.

## Skill
`/modofriki-feature <feature>` es el flujo completo de `docs/agents/WORKFLOW.md` adaptado a Claude.
MVP terminado (dominios `auth`, `catalog`, `community`, `reading`, `discovery`). Cada feature nueva pasa por el skill con su propia rama.

## Pruebas de API (`postman/README.md`)
- `/probar-backend [carpeta]`: entorno desechable en Docker (`npm run test:env:up` + `test:env:server`), colección `postman/ModoFriki-API.postman_collection.json` con newman (`npm run test:api`) y reporte clasificado de `tester-api`. Solo lee.
- `/corregir-backend [carpeta]`: prueba, corrige bugs delegando en el rol dueño, re-prueba (máx. 2 rondas), `npm test` + build + `reviewer`. No hace commit.
- MCP `postman` (`.mcp.json`): usa la `POSTMAN_API_KEY` personal de cada uno (variable de entorno del sistema, nunca en el repo) solo para sincronizar la colección con Postman. Ejecuta newman, porque Postman en la nube no llega a `localhost`.
- Nunca correr la colección contra Render: la guardia es `GET /api/works/66666666-6666-4666-8666-666666666666` → 200 (fixture que solo existe en la DB de pruebas).
- Si cambias un endpoint, actualiza su request en la colección en el mismo PR.

## Hooks (`.claude/settings.json`)
- **PreToolUse en Edit/Write:** bloquea `.env*` (excepto `.env.example`) y `src/generated/**`.
- **PreToolUse en Bash/PowerShell:** hace cumplir las prohibiciones de `AGENTS.md`: `migrate reset`/`dev`, `--accept-data-loss`, DROP/TRUNCATE, borrados masivos, `push --force`, `reset --hard`, push a `main`/`qa` y commit/merge estando en `main`/`qa`.
- **PostToolUse en Edit/Write:** `tsc --noEmit` tras editar `.ts`, y `prisma validate` + `generate` tras editar `schema.prisma`. Si falla, se corrige antes de seguir.

## Git
Una rama `feat/<feature>` por feature, que sale de `dev`. Con el OK del usuario: commit, merge `--no-ff` a `dev` y push de `dev`. Nunca hacia `main` o `qa`.
