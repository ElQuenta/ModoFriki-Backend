# Feature: popular

## Objetivo

Ranking de obras por visitas para la portada. Es la segunda ruta del módulo `discovery`.

## Estado actual

- El módulo `discovery` ya existe (ver `docs/features/latest-chapters.md`) y tiene `GET /chapters/latest`.
- `Work` no tiene columna `views`. Las visitas son filas de `WorkVisitEvent(workId, occurredAt)` y ya existe el índice `WorkVisitEvent_workId_occurredAt_idx`. Las crea `POST /works/:workId/visits` (reading).
- Sin `@@map`/`@map`: las tablas son `"Work"` y `"WorkVisitEvent"`, y las columnas van en camelCase entre comillas (`"workId"`, `"occurredAt"`, `"publicationStatus"`, `"deletedAt"`, `"publishedAt"`, `"typeId"`).
- Colisiones: `app.ts` monta `discoveryRouter` antes de `catalogRouter` y `readingRouter`, así que `GET /works/popular` gana a `GET /works/:workId` (catalog). Reading solo tiene `/works/:workId/{visits,stats,rating}`, que son más profundas. Community no tiene rutas `/works`.

## Alcance

Dentro: `GET /api/works/popular` (P1). Fuera: recommended, schema, media, `sort=popular` de `/works`.

## API

GET `/api/works/popular`, pública.
Query: `period?` `all|day` (default `all`), `page?` 1..100000 (default 1), `limit?` 1..50 (default 12), `typeId?` UUID. Se rechazan las claves desconocidas.
Response: `{ success, code: 200, data: Paginated<PopularWork> }`, con `PopularWork = { work: WorkRef; visits: number }`.
Incluye todas las obras PUBLISHED y no eliminadas, también con 0 visitas. Orden: `visits desc, publishedAt desc nulls last, id desc`. Con `day`, `occurredAt >= now() - 24h`. Un `typeId` inexistente devuelve una página vacía.
Errores: 400 si la query es inválida.

## Pipeline de middlewares

`GET /works/popular` → `controller.listPopularWorks` (sin auth). El servicio valida `req.query`, igual que en latest.

## Persistencia

Solo lectura en PostgreSQL. No intervienen Mongo ni Blob, no hay migraciones ni índices nuevos, y no hace falta plan de recuperación.

Query recomendada (en el repo, dentro de `this.client.$transaction([...])` o con dos awaits):

```ts
const since = period === "day" ? new Date(Date.now() - 86_400_000) : new Date(0);
const typeFilter = typeId ? Prisma.sql`AND w."typeId" = ${typeId}::uuid` : Prisma.empty;
const rows = await this.client.$queryRaw<{ id: string; visits: bigint }[]>`
  SELECT w."id", COUNT(v."id") AS visits
  FROM "Work" w
  LEFT JOIN "WorkVisitEvent" v ON v."workId" = w."id" AND v."occurredAt" >= ${since}
  WHERE w."publicationStatus" = 'PUBLISHED' AND w."deletedAt" IS NULL ${typeFilter}
  GROUP BY w."id"
  ORDER BY visits DESC, w."publishedAt" DESC NULLS LAST, w."id" DESC
  LIMIT ${limit} OFFSET ${(page - 1) * limit}`;
const total = await this.client.work.count({ where: { publicationStatus: "PUBLISHED", deletedAt: null, ...(typeId ? { typeId } : {}) } });
const works = await this.client.work.findMany({ where: { id: { in: rows.map(r => r.id) } }, select: summarySelect });
const byId = new Map(works.map(w => [w.id, workSummary(w)]));
const items = rows.map(r => ({ work: byId.get(r.id)!, visits: Number(r.visits) }));
```

`Prisma` (para `sql`/`empty`) se importa de `src/generated/prisma/client`. El `bigint` se pasa a `number` con `Number()`. `w."publicationStatus" = 'PUBLISHED'` funciona porque el literal se castea solo al enum.

## Contratos compartidos

`src/types/discovery.types.ts` (db) agrega:

```ts
export interface PopularWork { work: WorkRef; visits: number }
export interface PopularWorksQuery { period: "all" | "day"; page: number; limit: number; typeId?: string }
// en DiscoveryRepositoryContract:
listPopularWorks(query: PopularWorksQuery): Promise<Paginated<PopularWork>>;
```

`DiscoveryRepository.listPopularWorks(query: PopularWorksQuery): Promise<Paginated<PopularWork>>` usa `run("Unable to list popular works", …)`.

`dev`:
- `popularWorksQuerySchema = Joi.object({ period: Joi.string().valid("all", "day").default("all"), page, limit, typeId (igual que latest) }).unknown(false).default({})`
- `DiscoveryService.listPopularWorks(input: unknown): Promise<Paginated<PopularWork>>`
- `DiscoveryController.listPopularWorks`
- `router.get("/works/popular", controller.listPopularWorks)`

## Tareas

### TASK-01
Responsable: db
Archivos propios: `src/types/discovery.types.ts`, `src/repositories/discovery/discovery.repository.ts`
Dependencias: ninguna.
Criterios de aceptación: `tsc --noEmit` OK, aparecen las obras con 0 visitas, el orden coincide con el contrato, `total` sale del mismo filtro de visibilidad y `typeId`, y `visits` es `number`. `typeId` va parametrizado, sin interpolar strings.

### TASK-02
Responsable: dev
Archivos propios: `src/middlewares/schemas/discovery.schema.ts`, `src/services/discovery/discovery.service.ts`, `src/controllers/discovery/discovery.controller.ts`, `src/routes/discovery.routes.ts`, `openapi.yaml`
Dependencias: TASK-01.
Criterios de aceptación: `tsc --noEmit` y `npm run build` OK, `openapi.yaml` documenta `GET /api/works/popular` con el schema `PopularWork`, y `app.ts` no cambia.

## Plan de pruebas

Con `B=http://localhost:3000/api`:
1. `curl "$B/works/popular"` → 200, `page=1`, `limit=12`, `visits` numérico y orden descendente.
2. `curl -X POST "$B/works/<id>/visits"` (ver el contrato de visits), después `?period=day` → esa obra tiene `visits ≥ 1` y queda arriba si las demás tienen 0.
3. `?period=day&limit=5&page=2` → 200, con el mismo `total` que el caso 1.
4. `?typeId=<uuid aleatorio>` → 200, `items=[]`, `total=0`.
5. Casos de 400: `?period=week`, `?limit=51`, `?page=0`, `?typeId=abc`, `?foo=1`.
6. Regresión: `GET $B/works/<id>`, `GET $B/chapters/latest` y `GET $B/works/<id>/stats` siguen igual.

## Riesgos

- Con `all` se hace un COUNT sobre todos los eventos de cada página: O(eventos). Alcanza para el MVP. Si crece, conviene un contador materializado (feature de schema).
- Los empates sin `publishedAt` caen al final por `NULLS LAST`. En las obras PUBLISHED, `publishedAt` no debería ser null.

## Integración

Rama: `feat/popular` (sale de `dev`). Build, tests y revisión: pendientes.

## Integración
- Rama: feat/popular. tsc y build OK. Reviewer: 1 MEDIA (typeId con wrapper → 500) corregido en ronda 1. Test curl contra Postgres local en Docker: 32/32 ✅.
