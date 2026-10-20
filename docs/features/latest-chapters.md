# Feature: latest-chapters

## Objetivo

Exponer los últimos capítulos publicados para la portada (sección "Novedades"). Abre el módulo `discovery`, que después alojará `popular` y `recommended`.

## Estado actual

- `src/app.ts` monta `/api/auth`, y luego `communityRouter`, `catalogRouter` y `readingRouter` en `/api`. No existe `/api/chapters/latest`.
- Colisiones: ninguna. `reading` solo tiene `POST /chapters/:chapterId/read-events` (otro método y otra profundidad). `catalog` usa `/works/:workId/chapters...`. Aun así, `discoveryRouter` se monta **antes** de `catalogRouter`, para que ningún `/chapters/:id` futuro capture `latest`.
- Patrón a imitar: módulo `reading` (`src/routes/reading.routes.ts` como factory con DI, servicio y repositorio como clases con `run()`, logger y `catchAndLogError`, y un controller con `handle()`).
- `src/middlewares/validateQuery.middleware.ts` usa `stripUnknown: true` y asigna `req.params = value`, así que **no rechaza claves desconocidas** y no sirve aquí. Se valida en el servicio, como `reading` (`validateReading` con `.unknown(false)`).
- Ya existe `workSummary()`/`summarySelect` en `src/repositories/reading/reading.persistence.ts`, con la forma exacta de `WorkRef`. Se reutiliza.
- No hay tipo `Paginated<T>` en `src/types` (solo `ReadingPage<T>` con `skip/take`). Se crea en `discovery.types.ts`.

## Alcance

Dentro: `GET /api/chapters/latest` (P1).
Fuera: popular y recommended (otra feature), cambios de schema, uploads.

## API

Método: GET
Ruta: /api/chapters/latest
Autenticación: ninguna
Autorización: pública
Request (query): `page?` int ≥ 1 (default 1), `limit?` int 1..50 (default 12), `typeId?` UUID. Se rechazan las claves desconocidas.
Response: `{ success, code: 200, data: Paginated<LatestChapter> }`

```ts
interface WorkRef { id: string; slug: string; title: string; coverUrl: string | null }
interface LatestChapter {
  id: string; workId: string; number: string;
  title: string | null; kind: "NORMAL" | "EXTRA" | "ANNOUNCEMENT";
  publishedAt: string; work: WorkRef;
}
```

Un `typeId` inexistente devuelve una página vacía (no es 404).
Errores esperados: 400 si la query es inválida (UUID mal formado, page/limit fuera de rango, clave desconocida).

## Pipeline de middlewares

`GET /chapters/latest` → `controller.listLatestChapters` (sin auth). El servicio valida `req.query`.

## Persistencia

- PostgreSQL/Prisma: lectura de `Chapter` + `Work` + `MediaAsset` (cover). Es la fuente de verdad.
- MongoDB y Blob: no se usan.
- Migraciones: ninguna.
- Índices: ninguno nuevo (ver Riesgos).
- Plan de recuperación: no aplica, porque es una operación de solo lectura.

Query (dentro de `this.client.$transaction([...])`):

```ts
const where = {
  status: "PUBLISHED", deletedAt: null, publishedAt: { not: null },
  work: { publicationStatus: "PUBLISHED", deletedAt: null, ...(typeId ? { typeId } : {}) }
} as const;
// findMany({ where, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], skip: (page-1)*limit, take: limit,
//   select: { id, workId, number, title, kind, publishedAt, work: { select: summarySelect } } })
// count({ where })
// map: { ...c, number: c.number.toString(), publishedAt: c.publishedAt!, work: workSummary(c.work) }
```

`visibleChapter` de `reading.persistence.ts` puede usarse como base del `where`, siempre que se fusione `typeId` dentro de `work`.

## Contratos compartidos

`src/types/discovery.types.ts` (db):

```ts
export interface Paginated<T> { items: T[]; total: number; page: number; limit: number }
export interface WorkRef { id: string; slug: string; title: string; coverUrl: string | null }
export interface LatestChapter {
	id: string; workId: string; number: string; title: string | null;
	kind: "NORMAL" | "EXTRA" | "ANNOUNCEMENT"; publishedAt: Date; work: WorkRef;
}
export interface LatestChaptersQuery { page: number; limit: number; typeId?: string }
export interface DiscoveryRepositoryContract {
	listLatestChapters(query: LatestChaptersQuery): Promise<Paginated<LatestChapter>>;
}
```

`publishedAt` sale como `Date` y se serializa a ISO en JSON. `kind` puede tiparse como `ChapterKind` de `src/generated/prisma`.

`src/repositories/discovery/discovery.repository.ts` (db):

```ts
export class DiscoveryRepository implements DiscoveryRepositoryContract {
	constructor(private readonly client: PrismaClient = prisma) {}
	listLatestChapters(query: LatestChaptersQuery): Promise<Paginated<LatestChapter>>;
}
export const discoveryRepository = new DiscoveryRepository();
```

`dev`:
- `discovery.schema.ts`: `latestChaptersQuerySchema = Joi.object({ page: int min1 max100000 default1, limit: int min1 max50 default12, typeId: Joi.string().guid() }).unknown(false).default({})`, más `validateDiscovery<T>(schema, input)` que lanza `AppError("Validation error: …", 400)`.
- `DiscoveryService.listLatestChapters(query: unknown): Promise<Paginated<LatestChapter>>`, con `export const discoveryService`.
- `DiscoveryController.listLatestChapters`, como RequestHandler vía `handle()`.
- `createDiscoveryRouter(service = discoveryService): Router`, con `export default createDiscoveryRouter()`.

Errores: 400 del servicio. El resto pasa por `catchAndLogError` y da 500.

## Tareas

### TASK-01
Responsable: db
Objetivo: tipos + repositorio de discovery.
Archivos propios: `src/types/discovery.types.ts`, `src/repositories/discovery/discovery.repository.ts`
Dependencias: ninguna.
Contrato: el de arriba. Reutiliza `summarySelect`/`workSummary` de `reading.persistence.ts` (importar, no copiar) y el patrón `run()` + logger `DiscoveryRepository`.
Criterios de aceptación: `npx tsc --noEmit` OK. `number` como string. Orden `publishedAt desc, id desc`. `total` con el mismo `where`.

### TASK-02
Responsable: dev
Objetivo: schema, servicio, controller, ruta, registro y docs.
Archivos propios: `src/middlewares/schemas/discovery.schema.ts`, `src/services/discovery/discovery.service.ts`, `src/controllers/discovery/discovery.controller.ts`, `src/routes/discovery.routes.ts`, `src/app.ts`, `openapi.yaml`
Dependencias: TASK-01.
Contrato: el de arriba. En `app.ts`, `app.use("/api", discoveryRouter)` justo antes de `app.use("/api", catalogRouter)`. Documentar en `openapi.yaml` `GET /api/chapters/latest` con sus schemas `LatestChapter`/`WorkRef`.
Criterios de aceptación: `npx tsc --noEmit` y `npm run build` OK. No usar `validateQuery.middleware.ts`. Las rutas existentes siguen igual.

## Plan de pruebas

Con `B=http://localhost:3000/api` y `T=<id de GET $B/work-types>`:

1. `curl "$B/chapters/latest"` → 200, `limit=12`, `page=1`, items ordenados por `publishedAt` desc, `number` string, `work.coverUrl` presente (o null).
2. `curl "$B/chapters/latest?page=2&limit=5"` → 200, `limit=5`, `page=2`, `total` igual que en el caso 1.
3. `curl "$B/chapters/latest?typeId=$T"` → 200, todas las obras de ese tipo (contrastar con `GET /works/:id`).
4. `curl "$B/chapters/latest?typeId=<uuid v4 aleatorio>"` → 200, `items=[]`, `total=0`.
5. `curl "$B/chapters/latest?limit=51"` → 400.
6. `curl "$B/chapters/latest?page=0"` → 400.
7. `curl "$B/chapters/latest?typeId=abc"` → 400.
8. `curl "$B/chapters/latest?foo=1"` → 400.
9. Visibilidad: ningún capítulo DRAFT/eliminado ni de obra no publicada (comparar con `GET /works/:id/chapters` de una obra con DRAFT, si el seed la tiene).
10. Regresión: `POST $B/chapters/<id>/read-events` y `GET $B/works` siguen respondiendo igual.

## Riesgos

- No hay índice en `Chapter(status, deletedAt, publishedAt)`: con el seed actual no importa, pero en volumen la consulta hace un scan. Se agregaría `@@index([status, publishedAt, id])` en una feature de schema; queda fuera por decisión de alcance.
- `validateQuery.middleware.ts` tiene un bug (`req.params = value`, y además `stripUnknown`). No se toca aquí. Avisar al usuario o abrir una tarea aparte.
- Que `discovery` dependa de `reading.persistence.ts` es un acoplamiento leve entre módulos. Si `architect` lo prefiere, se mueve `workSummary` a un util compartido. Sin bloqueo.

## Integración

Rama feature: `feat/latest-chapters` (sale de `dev`).
Ramas de agentes: la misma (Claude, archivos disjuntos).
Commits / build / tests / revisión / QA: pendientes.

## Criterios de aceptación

- Los 10 casos del plan de pruebas dan el resultado esperado.
- La respuesta coincide con `Paginated<LatestChapter>` de `docs/API.md` sin cambiar el contrato.
- `tsc --noEmit` y `build` pasan.

## Integración
- Rama: feat/latest-chapters. tsc y build OK. 400 de query verificados con curl; casos 200 verificados después contra Postgres local en Docker (migrate deploy + fixtures), 32/32 junto con popular.
