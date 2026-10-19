@AGENTS.md

# Solo para Claude Code

De `AGENTS.md` aplica todo: arquitectura, persistencia, pipeline multimedia, Git y contrato de entrega. Lo único que no aplica son las sesiones de Codex y los worktrees: en Claude los subagentes comparten carpeta y rama, por eso cada rol tiene **archivos propios disjuntos** (tabla de abajo) y se ejecutan en el orden que marca el skill.

- **Contrato:** `docs/API.md` (P1 = MVP de hoy). El frontend lo construye otra persona en otro repo contra ese contrato. No lo cambies sin el OK del usuario.
- **Referencia de estilo:** ElQuenta/TankoBase, citada en `AGENTS.md`.

## Comandos
- `npm run dev`: http://localhost:3000, con `GET /health`.
- `npx prisma generate`: obligatorio tras clonar (`src/generated/` está en .gitignore).
- `npx prisma db push` y `npx prisma db seed`. No uses `migrate dev`, porque Render no tiene shadow DB; la DB es compartida.
- `npx tsc --noEmit` y `npm run build`.
- No hay scripts de `test` ni de `lint`: no los inventes. Las pruebas son con `curl`, a cargo del subagente `test`.

## Arquitectura por capas (un archivo `<entidad>.<capa>.ts` por recurso)
| Capa | Carpeta | Convención |
| --- | --- | --- |
| Routes | `src/routes/` | `Router()` + `router.route("/").get(…).post(…)`; se registran en `src/app.ts` con `app.use("/api/<recurso en plural del contrato>", …)` |
| Controllers | `src/controllers/` | `export const getX = async (req: Request, res: Response) => { try { … SuccessResponseHandler(res, data); } catch (error) { ErrorResponseHandler(res, error); } };`, sin Prisma ni Mongoose |
| Services | `src/services/` | `const logger = createLogger("XService")`; cada función hace `try { … } catch (error) { catchAndLogError(logger, error, "Error …"); }`. Los errores esperados son `new AppError("…", 4xx)`. Sin Request/Response ni Blob |
| Repositories | `src/repositories/` | Única capa con `prisma` o Mongoose. Devuelve formas del contrato (`chaptersCount`, nunca `passwordHash`) y mapea P2002 → `AppError` 409 y P2025 → 404 |
| Models | `src/models/` | Solo Mongoose (`comment.model.ts`) |
| Validations | `src/validations/` | Joi: `create<X>Schema`, `update<X>Schema` (`.min(1)`), `<x>ParamSchema`, `<x>QuerySchema`; enums de Prisma |

## Middlewares (`src/middlewares/`; responden con `ErrorResponseHandler` en su catch)
- `authenticate`: Bearer JWT → `req.user = { id, role }`, tipado en `src/types/express.d.ts`.
- `authorize(["ADMIN"])`: 401 sin usuario, 403 sin rol.
- `validateBody`, `validateParams`, `validateQuery` (Joi con `abortEarly: false`, `convert: true`): 400 con `Validation error: …`.
- Pipeline de upload: `authenticate → authorize → validateParams → uploadSingle/uploadMultiple → validateBody → uploadToBlob → controller`. Deja `res.locals.uploadedMedia: UploadedMedia | UploadedMedia[]` (`{ url, pathname, contentType, size }`, tipo en `src/types/media.ts`). Si la persistencia falla, el controller llama a `deleteUploadedMedia(res)`.
- Respuestas: `{ success, code, data }`. Paginados: `{ items, total, page, limit }`, con `limit` ≤ 50. Documentación en `openapi.yaml` (raíz), servida en `/api/docs`.
- Estilo: comillas dobles, punto y coma, tabs, exports con nombre, imports sin extensión (CommonJS).

## Roles (subagentes en `.claude/agents/`) y archivos propios
| Rol | Edita | Cuándo |
| --- | --- | --- |
| `planner` | `docs/features/<feature>.md` | Al inicio de cada feature |
| `architect` | Nada (consulta) | Solo si hay una decisión estructural sin resolver |
| `db` | `prisma/schema.prisma`, `prisma/seed.ts`, `prisma.config.ts`, `src/config/database/**`, `src/models/**`, `src/repositories/**` | Si la feature toca datos |
| `media` | `src/middlewares/upload.middleware.ts`, `src/middlewares/blob.middleware.ts`, `src/types/media.ts` | Si la feature sube archivos |
| `dev` | `src/routes/**`, `src/controllers/**`, `src/services/**`, `src/validations/**`, `src/middlewares/{auth,role,validate}.middleware.ts`, `src/types/express.d.ts`, `src/app.ts`, `openapi.yaml`, `package.json` | Siempre, después de `db` y `media` |
| `test` | Nada (prueba con curl) | Después de implementar |
| `reviewer` | Nada (revisa) | Antes de cada commit |
| `security` | Nada (audita) | En paralelo con `reviewer` si la feature toca auth, permisos, uploads o secretos |

Los hallazgos vuelven al **dueño del archivo**, nunca a otro rol. Si un archivo no aparece en la tabla, lo edita el agente principal.

Dependencias: cualquier rol puede instalar los `@types/*` que necesiten sus archivos (`npm i -D @types/multer`, por ejemplo). Las dependencias de runtime nuevas las agrega solo `dev`, justificándolo en su entrega; la única prevista es `cors`.

## Skill
`/modofriki-feature <feature>` es el flujo completo de `docs/agents/WORKFLOW.md` adaptado a Claude.
Orden del MVP: `base` → `schema` → `auth` → `genres-tags` → `works` → `chapters` → `favorites` → `comments` → `users` → `uploads`.

## Hooks (`.claude/settings.json`)
- **PreToolUse en Edit/Write:** bloquea `.env*` (excepto `.env.example`) y `src/generated/**`.
- **PreToolUse en Bash/PowerShell:** hace cumplir las prohibiciones de `AGENTS.md`: `migrate reset`/`dev`, `--accept-data-loss`, DROP/TRUNCATE, borrados masivos, `push --force`, `reset --hard`, push a `main`/`qa` y commit/merge estando en `main`/`qa`.
- **PostToolUse en Edit/Write:** `tsc --noEmit` tras editar `.ts`, y `prisma validate` + `generate` tras editar `schema.prisma`. Si falla, se corrige antes de seguir.

## Git
Una rama `feat/<feature>` por feature, que sale de `dev`. Con el OK del usuario: commit, merge `--no-ff` a `dev` y push de `dev`. Nunca hacia `main` o `qa`.
