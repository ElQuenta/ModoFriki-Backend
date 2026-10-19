# Feature: base

## Objetivo

Dejar la infraestructura transversal que van a usar todas las features siguientes. Son los middlewares de auth, rol y validación; CORS; `/api/docs`; un 404 y errores siempre en JSON, y logs de conexión sin credenciales. Esta feature no expone endpoints de recursos.

## Estado actual

Lo verifiqué leyendo el código en `dev` (72582cb, árbol limpio). `npx tsc --noEmit` da exit 0.

- `src/app.ts`: solo `loggerMiddleware`, `express.json()` y `GET /health`. No tiene CORS, ni 404, ni error handler: un JSON malformado responde con el HTML por defecto de Express.
- `src/index.ts`: llama a `connectDatabase()` y `connectMongoDB()` sin `await` dentro del callback de `app.listen`, así que el server acepta peticiones antes de conectarse.
- `src/config/env.ts`: Joi con `NODE_ENV, PORT, DATABASE_URL, MONGODB_URI, JWT_SECRET (min 32), BCRYPT_SALT_ROUNDS, BLOB_READ_WRITE_TOKEN, LOG_LEVEL`. No hay variable para el origen del frontend. Además, `BLOB_READ_WRITE_TOKEN: Joi.string().optional()` rechaza el `""` que trae `.env.example`: un clon nuevo con `.env.example` copiado no arranca.
- `src/config/database/postgres.ts:15` y `mongodb.ts:9`: `logger.debug` con la URI completa, credenciales incluidas. En los dos `catch` está `${error}` crudo.
- `src/handlers/error.handler.ts`: `GetErrorCode` devuelve `err.message` de cualquier `Error` que no sea `AppError` con 500, lo que filtra mensajes internos.
- `src/handlers/success.handler.ts`, `src/utils/AppError.ts` y `src/utils/logger.ts` (`createLogger`, `catchAndLogError`) existen y se reutilizan.
- No existen `src/routes`, `controllers`, `services`, `repositories`, `validations` ni `types`, ni tampoco `openapi.yaml`.
- Dependencias: `express 5.3.0`, `joi 18.3.0`, `jsonwebtoken 9.0.3`, `swagger-ui-express 5.0.1` y `yaml 2.9.1` (este trae sus propios tipos). Faltan `cors`, `@types/cors`, `@types/jsonwebtoken` y `@types/swagger-ui-express`.
- `prisma/schema.prisma` solo tiene `Example`. No se toca: es la feature `schema`.

## Alcance

Dentro (P1, infraestructura):
1. `authenticate`, `authorize(roles)`, `validateBody`, `validateParams` y `validateQuery`, junto con el tipo `req.user`.
2. `src/app.ts`: CORS (`http://localhost:5173` + `FRONTEND_URL` opcional), `/api/docs` (swagger-ui sobre `openapi.yaml`), 404 en JSON y un error handler final en JSON (JSON malformado → 400, body grande → 413, el resto → 500 genérico).
3. `openapi.yaml` inicial: info, servers, `bearerAuth`, envelopes, errores y enums comunes, y `/health`.
4. Logs de conexión sin credenciales. Conexión a las DB antes de `listen`.
5. Un 500 genérico para errores que no son `AppError`, y `BLOB_READ_WRITE_TOKEN` vacío permitido.

Fuera:
- Endpoints de recursos y schema de Prisma: llegan en `schema`, `auth` y las siguientes.
- **Firma de JWT:** no hay helper `signToken` en `base`. Su único consumidor es `auth.service.ts` (feature `auth`, rol `dev`), así que firma ahí con el contrato de abajo. Un helper con un solo uso y sin consumidor hoy es YAGNI.
- Rutas de prueba en producción: no se crean. Los middlewares se prueban con un harness desechable fuera del repo (ver Plan de pruebas).
- Revalidar el usuario en DB dentro de `authenticate`: no se hace (JWT stateless, ver Riesgos).

## API

No hay endpoints de recursos. Comportamiento transversal:

| Método | Ruta | Auth | Respuesta | Errores esperados |
|---|---|---|---|---|
| GET | `/health` | — | 200 `{ success: true, code: 200, data: { status: "ok" } }` (sin cambios) | — |
| GET | `/api/docs` | — | 301 a `/api/docs/` y luego 200 HTML de Swagger UI. `/api/docs/swagger-ui-init.js` lleva la spec | — |
| OPTIONS | cualquiera | — | 204 de preflight. `Access-Control-Allow-Origin` solo para los orígenes permitidos | — |
| * | ruta inexistente | — | — | 404 `{ success: false, code: 404, error: { message: "Route not found" } }` |
| POST/PUT/PATCH | cualquiera, con `Content-Type: application/json` | — | — | 400 `Malformed JSON body` (JSON inválido) · 413 `Payload too large` (> 100 kb, el límite por defecto de `express.json`) |
| * | cualquiera, con error no controlado | — | — | 500 `Internal Server Error` (sin el mensaje interno) |

Forma de error, según el contrato: `{ "success": false, "code": 4xx|5xx, "error": { "message": "..." } }`. Nunca HTML.

Mensajes fijos de los middlewares, para que `test` los verifique:

| Middleware | Caso | Código | `error.message` |
|---|---|---|---|
| `authenticate` | Sin header, o que no es `Bearer <token>` | 401 | `Authentication required` |
| `authenticate` | Firma inválida, expirado, `alg` distinto de HS256 o payload sin `id` string o con `role` fuera de `USER`/`ADMIN` | 401 | `Invalid or expired token` |
| `authorize` | Sin `req.user` | 401 | `Authentication required` |
| `authorize` | Con un rol que no está en la lista | 403 | `Insufficient permissions` |
| `validate*` | Joi falla | 400 | `Validation error: <detalle1>, <detalle2>…` (todos los detalles, porque va `abortEarly: false`) |

## Pipeline de middlewares

Orden global en `src/app.ts`:

1. `loggerMiddleware` (existente)
2. `cors({ origin: allowedOrigins })`, con `allowedOrigins = ["http://localhost:5173", config.frontendUrl].filter(Boolean)`. Sin `credentials`, porque el auth va por header Bearer y no por cookies. Va antes de `express.json` y del 404 para que el preflight devuelva 204 en cualquier ruta.
3. `express.json()`
4. `GET /health`
5. `app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec))`, con `spec = YAML.parse(readFileSync(resolve(__dirname, "..", "openapi.yaml"), "utf8"))`. Esa ruta vale tanto desde `src/` (tsx) como desde `dist/` (build).
6. *(Las features siguientes insertan aquí `app.use("/api/<recurso>", router)`.)*
7. 404 catch-all: `app.use((_req, res) => ErrorResponseHandler(res, new AppError("Route not found", 404)))`. **No** usar `app.all("*")`, porque Express 5 (path-to-regexp v8) lo rechaza.
8. Error handler de 4 argumentos `(err, _req, res, next)`:
   - Si `res.headersSent`, hace `next(err)`.
   - `err.type === "entity.parse.failed"` → `AppError("Malformed JSON body", 400)`.
   - Otros errores de body-parser con `status` 4xx (`entity.too.large` → 413 `Payload too large`, charset → 415) → `AppError(<mensaje>, status)`.
   - El resto: `logger.error` con el mensaje y el stack (nunca headers ni body) y `ErrorResponseHandler(res, err)`, que después de TASK-02 da 500 genérico.

Orden por ruta para las features siguientes (referencia):
`authenticate → authorize([...]) → validateParams → validateQuery → validateBody → controller`.
Uploads (feature `uploads`): `authenticate → authorize → validateParams → uploadSingle/uploadMultiple → validateBody → uploadToBlob → controller`.

## Persistencia

PostgreSQL / Prisma: sin cambios de schema. Solo cambia el log de conexión en `src/config/database/postgres.ts`.
MongoDB / Mongoose: sin modelos. Solo cambia el log de conexión en `src/config/database/mongodb.ts`.
Vercel Blob: no aplica.
Fuente de verdad: no aplica.
Migraciones: ninguna. No se corre `db push`.
Índices: ninguno.
Plan de recuperación: no hay escritura de datos. Si alguna conexión falla al arrancar, `process.exit(1)` (comportamiento actual), y ahora pasa **antes** de `listen`, así que Render no marca vivo un server sin DB.

## Contratos compartidos

Tipos TypeScript (`src/types/express.d.ts`, de `dev`):
```ts
export type Role = "USER" | "ADMIN"; // igual que el enum Role del contrato y el futuro enum de Prisma
export interface AuthUser { id: string; role: Role }
declare global {
	namespace Express {
		interface Request { user?: AuthUser }
	}
}
```

Firmas de los middlewares (exports con nombre, de `dev`):
```ts
// src/middlewares/auth.middleware.ts
export const authenticate: RequestHandler;
// src/middlewares/role.middleware.ts
export const authorize: (roles: Role[]) => RequestHandler;
// src/middlewares/validate.middleware.ts
export const validateBody: (schema: Joi.Schema) => RequestHandler;
export const validateParams: (schema: Joi.Schema) => RequestHandler;
export const validateQuery: (schema: Joi.Schema) => RequestHandler;
```

Reglas de implementación que dependen del contrato:
- **JWT:** `authenticate` verifica con `jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] })`. El payload tiene que ser un objeto con `id: string` y `role ∈ {USER, ADMIN}`; si no, 401. Asigna `req.user = { id, role }`, solo esos dos campos (sin `iat` ni `exp`).
  - Contrato para la feature `auth`: `jwt.sign({ id, role } satisfies AuthUser, config.jwtSecret, { algorithm: "HS256", expiresIn: "7d" })`.
- **validate\*:** usa `schema.validate(req[source] ?? {}, { abortEarly: false, convert: true })`. El `?? {}` hace falta porque en Express 5 `req.body` es `undefined` si no hay body; así los `required()` dan 400. El valor convertido se asigna con `Object.defineProperty(req, source, { value, writable: true, enumerable: true, configurable: true })`. En Express 5 `req.query` es un getter del prototipo y `req.query = value` lanza TypeError. La misma vía sirve para `body` y `params`, y los controllers leen siempre `req.query`, `req.params` y `req.body` ya convertidos (números y defaults de Joi). `next()` va fuera del `try`.
- Los tres middlewares responden con `ErrorResponseHandler(res, error)` en su `catch`, lanzando antes `AppError(…, 401|403|400)`.

`src/config/env.ts` (del agente principal) agrega `config.frontendUrl?: string`: viene de `FRONTEND_URL`, que es opcional, se valida como URI http/https y se guarda sin la barra final.

`src/config/database/*` (de `db`) mantiene `connectDatabase(): Promise<void>` y `connectMongoDB(): Promise<void>`, y sigue haciendo `process.exit(1)` si falla.

Entradas y salidas: ver la tabla de API.
Metadatos multimedia: no aplica (`res.locals.uploadedMedia` llega en `uploads`).
Errores: `AppError` + `ErrorResponseHandler`, con los mensajes de la tabla de arriba.

## Tareas

Orden: TASK-01 (`db`) y TASK-02 (agente principal) no comparten archivos y van en serie en cualquier orden. TASK-03 (`dev`) va al final, porque usa `config.frontendUrl`. `media` no participa.

### TASK-01
Responsable: `db`
Objetivo: logs de conexión sin credenciales y conexión realmente verificada.
Archivos propios: `src/config/database/postgres.ts`, `src/config/database/mongodb.ts` (y un helper dentro de `src/config/database/` si lo usan los dos).
Dependencias: ninguna.
Contrato:
- Ningún `logger.*` interpola `config.db.postgresUrl`, `config.db.mongoUrl` ni la URI. Como mucho se loguea el host sin usuario ni contraseña, redactando con regex (`//usuario:pass@` → `//***@`). **No** usar `new URL()` con la URI de Mongo: la URI directa multi-host (`h1:27017,h2:27017`) lo rompe.
- En los `catch`, cambiar `${error}` crudo por `error.message` pasado por la misma redacción.
- Firmas y `process.exit(1)` sin cambios.
- Verificar si `prisma.$connect()` con `PrismaPg` abre de verdad la conexión. Si no lo hace (el adapter es lazy), añadir un `await prisma.$queryRaw\`SELECT 1\`` después del `$connect`, para que "Connected to PostgreSQL" signifique algo.
Tests: `npx tsc --noEmit`. Arrancar con `LOG_LEVEL=debug` y comprobar que la salida no contiene `://<user>:<pass>@`.
Criterios de aceptación:
- `grep -nE "logger\.[a-z]+\(.*(postgresUrl|mongoUrl)" src/config/database` no devuelve nada.
- Con `LOG_LEVEL=debug`, el log de arranque no contiene ninguna contraseña.
- `tsc --noEmit` pasa.

### TASK-02
Responsable: **agente principal** (estos archivos no están en la tabla de roles de `CLAUDE.md`).
Objetivo: variable del origen del frontend, arranque ordenado y 500 sin filtraciones.
Archivos propios: `src/config/env.ts`, `.env.example`, `src/index.ts`, `src/handlers/error.handler.ts`.
Dependencias: ninguna. Bloquea a TASK-03.
Contrato:
- `env.ts`:
  - Agregar `FRONTEND_URL: Joi.string().uri({ scheme: ["http", "https"] }).optional()`, el campo `frontendUrl?: string` en `EnvironmentVariables` y `frontendUrl: value.FRONTEND_URL?.replace(/\/+$/, "")`.
  - Cambiar `BLOB_READ_WRITE_TOKEN` a `Joi.string().allow("").optional()`.
- `.env.example`: agregar la línea comentada `# FRONTEND_URL="https://<frontend-desplegado>"`. El `.env` no se toca: el usuario agrega `FRONTEND_URL` a mano en `.env` y en Render.
- `index.ts`: `const start = async () => { await connectDatabase(); await connectMongoDB(); app.listen(port, () => logger.http(…)); }; void start();`.
- `error.handler.ts`: en `GetErrorCode`, un error que no es `AppError` da `{ statusCode: 500, message: "Internal Server Error" }`, sin `err.message`. Se arregla una vez en la función compartida y cubre a todos los que llaman.
Tests: `npx tsc --noEmit`. En el log de `npm run dev`, "Connected to PostgreSQL" y "Connected to MongoDB" salen antes de "Server running".
Criterios de aceptación: tsc pasa, el arranque sigue funcionando con el `.env` actual, se respeta el orden de logs y `.env.example` con el token vacío ya no rompe la validación.

### TASK-03
Responsable: `dev`
Objetivo: middlewares, `app.ts`, `openapi.yaml` y dependencias.
Archivos propios: `src/middlewares/auth.middleware.ts`, `src/middlewares/role.middleware.ts`, `src/middlewares/validate.middleware.ts`, `src/types/express.d.ts`, `src/app.ts`, `openapi.yaml`, `package.json` (y `package-lock.json` como efecto de `npm i`).
Dependencias: TASK-02 (`config.frontendUrl`). Comandos: `npm i cors` (la única dependencia de runtime prevista en `CLAUDE.md`, que exige el contrato) y `npm i -D @types/cors @types/jsonwebtoken @types/swagger-ui-express`.
Contrato: "Contratos compartidos" y "Pipeline de middlewares" de este plan.
- `openapi.yaml`, en la raíz:
  - `openapi: 3.0.3`, `info` (ModoFriki API, 1.0.0), `servers: [{ url: / }]`, que es relativo y sirve en local y en Render.
  - `components.securitySchemes.bearerAuth` (`http`, `bearer`, `JWT`).
  - `components.schemas`: `ErrorResponse`, `PaginationMeta` (`total`, `page`, `limit`) y los enums `Role`, `WorkType`, `WorkStatus` y `FavoriteStatus`.
  - `components.parameters`: `Page` (≥ 1, default 1) y `Limit` (1–50, default 20).
  - `components.responses`: `BadRequest`, `Unauthorized`, `Forbidden`, `NotFound` y `Conflict`, que apuntan a `ErrorResponse`.
  - `paths./health`.
  - Los schemas de recursos (`User`, `WorkSummary`…) los añade cada feature cuando implementa sus endpoints.
- Estilo: tabs, comillas dobles, punto y coma, exports con nombre e imports sin extensión. De paso, la línea 3 de `app.ts` necesita su punto y coma.
- Nada de rutas de prueba en el repo.
Tests: `npx tsc --noEmit`, `npm run build`, `node -e "require('yaml').parse(require('fs').readFileSync('openapi.yaml','utf8'))"` y los curls del Plan de pruebas contra `npm run dev`.
Criterios de aceptación: los de la sección final, puntos 1 a 8.

## Plan de pruebas

Lo ejecuta `test`, con `BASE=http://localhost:3000`. El agente principal levanta `npm run dev` con `LOG_LEVEL=debug` y la salida redirigida a un log en el scratchpad.

Unitarias: no hay framework (no se inventa `npm test`). En su lugar va el harness de middlewares de abajo.

Harness de middlewares (desechable, **fuera del repo**, en el scratchpad):
- Es un script `mw-check.ts` que carga los módulos del repo con `createRequire("<repo>/package.json")`: `express`, `jsonwebtoken`, `joi`, `./src/config/env` y los tres middlewares.
- Monta una app en el puerto 3999 con estas rutas:
  - `GET /p` → `authenticate`
  - `GET /a` → `authenticate, authorize(["ADMIN"])`
  - `GET /r` → `authorize(["ADMIN"])` sin `authenticate`
  - `GET /v/:id` → `validateParams({ id: uuid required })`, `validateQuery({ page: number integer min 1 default 1 })`
  - `POST /b` → `express.json()`, `validateBody({ name: string required, age: number required })`
- Cada handler hace eco de `req.user`, `req.params`, `req.query` y `req.body` con `typeof`.
- Los tokens se firman en el propio script con `config.jwtSecret`.
- Se ejecuta con `npx tsx <scratchpad>/mw-check.ts` desde la raíz del repo, para que dotenv lea `.env`.
- No se crean rutas de prueba en producción.

Integración (curl contra `npm run dev`):

| # | Caso | Comando | Esperado |
|---|---|---|---|
| 1 | Health | `curl -s $BASE/health` | 200 `{"success":true,"code":200,"data":{"status":"ok"}}` |
| 2 | 404 GET | `curl -s -w "\n%{http_code} %{content_type}\n" $BASE/api/no-existe` | 404, `application/json`, `error.message = "Route not found"` |
| 3 | 404 POST | `curl -s -w "\n%{http_code}\n" -X POST $BASE/nope` | 404 JSON |
| 4 | JSON malformado | `curl -s -w "\n%{http_code}\n" -X POST $BASE/api/no-existe -H "Content-Type: application/json" -d "{bad"` | 400 JSON `Malformed JSON body`, sin `<!DOCTYPE` ni stack |
| 5 | Body grande | `node -e "process.stdout.write(JSON.stringify({a:'x'.repeat(200000)}))" \| curl -s -w "\n%{http_code}\n" -X POST $BASE/health -H "Content-Type: application/json" --data-binary @-` | 413 JSON |
| 6 | Docs | `curl -s -o /dev/null -w "%{http_code}\n" -L $BASE/api/docs` y `curl -sL $BASE/api/docs \| grep -c swagger-ui` | 200 y ≥ 1 |
| 7 | La spec cargada | `curl -s $BASE/api/docs/swagger-ui-init.js \| grep -c bearerAuth` | ≥ 1 |
| 8 | Preflight permitido | `curl -si -X OPTIONS $BASE/api/works -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"` | 204, `Access-Control-Allow-Origin: http://localhost:5173`, `Allow-Methods` incluye POST, `Allow-Headers: authorization,content-type` |
| 9 | Preflight no permitido | igual que el 8, con `-H "Origin: http://evil.example"` | sin `Access-Control-Allow-Origin` |
| 10 | GET simple con Origin | `curl -si $BASE/health -H "Origin: http://localhost:5173"` / con `http://evil.example` | ACAO `http://localhost:5173` / sin ACAO |
| 11 | `FRONTEND_URL` (opcional) | levantar otra instancia: `FRONTEND_URL=https://front.example PORT=3001 npx tsx src/index.ts` (dotenv no pisa las variables ya definidas) y repetir el 8 con `Origin: https://front.example` contra `:3001` | ACAO `https://front.example` |
| 12 | Logs sin credenciales | `grep -E "://[^/@ ]+:[^/@ ]+@" <log>` | sin coincidencias |
| 13 | Orden de arranque | leer el `<log>` | "Connected to PostgreSQL" y "Connected to MongoDB" antes de "Server running" |

Autorización (harness, puerto 3999):

| Caso | Esperado |
|---|---|
| `GET /p` sin header | 401 `Authentication required` |
| `GET /p` con `Authorization: Basic abc` | 401 `Authentication required` |
| `GET /p` con `Bearer basura` | 401 `Invalid or expired token` |
| Token firmado con otro secreto | 401 |
| Token expirado (`exp` en el pasado) | 401 |
| Token `alg: none` | 401 |
| Token con `role: "ROOT"` o sin `id` | 401 |
| Token USER válido en `/p` | 200, y `req.user` es exactamente `{ id, role }` |
| Token USER en `/a` | 403 `Insufficient permissions` |
| Token ADMIN en `/a` | 200 |
| `/r` sin `authenticate` | 401 |

Casos negativos de validación (harness):

| Caso | Esperado |
|---|---|
| `GET /v/no-uuid` | 400 `Validation error: …` |
| `GET /v/<uuid>?page=2` | 200 con `typeof page === "number"`: la asignación sobre el getter de Express 5 funciona |
| `GET /v/<uuid>` | 200 con `page = 1` (default de Joi aplicado) |
| `POST /b` sin body ni Content-Type | 400, y el mensaje menciona **los dos**, `"name"` y `"age"` (`abortEarly: false` y `req.body ?? {}`) |
| `POST /b` con `{"name":"x","age":"5"}` | 200 con `age` igual a 5, de tipo number |

Regresiones: `npx tsc --noEmit` y `npm run build` sin errores. `/health` igual que antes.

Revalidación en features siguientes (con rutas reales, no en `base`):
- `auth`: `GET /api/auth/me` sin token, con token inválido y con token válido; `POST /api/auth/register` con body inválido → 400.
- `uploads`: `POST /api/works` con token USER → 403. Es la primera ruta ADMIN del P1.

## Riesgos

- **JWT stateless** (decidido, no estructural): `authenticate` no consulta la DB. Un usuario borrado o un admin degradado conserva su acceso hasta que el token expira (7 días). Para el MVP se acepta; `GET /api/auth/me` sí lee la DB. Si hiciera falta más adelante, se puede buscar al usuario en `authenticate` o bajar la expiración. `security` puede opinar en su auditoría.
- **`localhost:5173` permitido también en producción:** el contrato lo pide, y sin cookies (Bearer) el riesgo es bajo.
- **`FRONTEND_URL` es un solo origen:** los previews de Vercel con otro dominio quedan bloqueados. Si se necesitan, se puede pasar a una lista separada por comas.
- **`FRONTEND_URL` debe configurarse a mano** en `.env` y en Render (el usuario). Sin ella, en producción solo se acepta localhost.
- **Express 5:** `req.query` es un getter, por eso se usa `Object.defineProperty` por request. `app.all("*")` falla, por eso el 404 va con `app.use` sin ruta. `req.body` puede ser `undefined`, por eso `?? {}`.
- **`/api/docs` hace 301 a `/api/docs/`** (serve-static de swagger-ui-express). Las pruebas usan `-L`.
- **`openapi.yaml` inválido tumba el arranque** (`YAML.parse` al cargar `app.ts`). Es fail-fast intencional: el test 6 y el parse en TASK-03 lo detectan.
- **El adapter de Prisma puede ser lazy:** sin `SELECT 1`, "Connected" no garantiza credenciales válidas (TASK-01 lo verifica).
- **URI de Mongo multi-host:** `new URL()` falla con ella, así que la redacción va por regex (TASK-01).
- **Fuera de alcance:** `package.json` tiene `"prisma:migrate": "prisma migrate dev"`, que contradice `CLAUDE.md`. El hook lo bloquea igual y no se toca aquí.
- **Decisiones estructurales abiertas: ninguna.** No hace falta consultar a `architect`.

## Integración

Rama feature: `feat/base` (sale de `dev`).
Ramas de agentes: ninguna. Los subagentes trabajan en serie sobre `feat/base`, con archivos disjuntos.
Commits: `feat(base): middlewares de auth/rol/validación, CORS, docs, 404 y errores JSON` (con OK del usuario), luego merge `--no-ff` a `dev` y push de `dev`.
Resultado de build: `npx tsc --noEmit` exit 0 · `npm run build` exit 0 (`dist/` borrado después).
Resultado de tests: `test` ejecutó los 13 casos de integración, 11 de autorización, 5 de validación y extras (500 genérico con el error handler real, DB inalcanzable → exit 1, `.env.example` válido): todos ✅. El criterio 7 queda parcial: no hay controllers todavía.
Revisión: `reviewer` dio apto; su único MEDIA (el callback de `listen` ignoraba `EADDRINUSE`) quedó corregido en `src/index.ts` y verificado: con el puerto ocupado sale con exit 1. `security` encontró un ALTA de configuración: el `JWT_SECRET` local es el placeholder de `.env.example` y lo tiene que rotar el usuario. En el código solo dejó BAJA:
- `maxAge` en `verify`, `x-powered-by` y el mensaje 4xx genérico: pasan a la feature `auth` (dev).
- `errorFormat: "minimal"`: pasa a la feature `schema` (db).
Desvíos del plan:
- `ssl: true` en `PrismaPg`: Render exige TLS y `DATABASE_URL` no trae `sslmode`.
- `FRONTEND_URL` con `.allow("")`.
- `.env.example` con `sslmode=disable` para Postgres local.
Aprobación QA: no aplica (no se integra a `qa` ni a `main`).

## Criterios de aceptación

1. `npx tsc --noEmit` y `npm run build` pasan.
2. `GET /health` sigue respondiendo como antes.
3. Toda ruta inexistente responde 404 JSON con la forma del contrato. Un JSON malformado da 400 JSON, un body > 100 kb da 413 JSON y un error no controlado da 500 `Internal Server Error`. Nunca sale HTML ni stack.
4. `/api/docs` (con `-L`) responde 200 con Swagger UI, y la spec servida incluye `bearerAuth` y `/health`.
5. El preflight y las peticiones con `Origin: http://localhost:5173` (y `FRONTEND_URL` si está definida) reciben `Access-Control-Allow-Origin`; otros orígenes no.
6. `authenticate`, `authorize` y `validate*` cumplen todos los casos del harness con los códigos y mensajes de la tabla de API.
7. `req.user` está tipado como `{ id: string; role: "USER" | "ADMIN" }` en `src/types/express.d.ts`, y en los controllers se usa sin casts.
8. `cors` está en `dependencies`; `@types/cors`, `@types/jsonwebtoken` y `@types/swagger-ui-express` están en `devDependencies`.
9. Ningún log de arranque (ni con `LOG_LEVEL=debug`) contiene credenciales de Postgres ni de Mongo.
10. El server conecta a Postgres y Mongo antes de `listen`; si una conexión falla, termina con exit 1.
11. Copiar `.env.example` con `BLOB_READ_WRITE_TOKEN=""` ya no rompe la validación de entorno.
