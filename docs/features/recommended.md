# Feature: recommended

## Objetivo

Recomendaciones para la portada: obras que comparten géneros con los favoritos del usuario. Sin sesión se comporta como `popular`. Es la tercera ruta del módulo `discovery`.

## Estado actual

- `discovery` ya tiene `GET /chapters/latest` y `GET /works/popular` (ver `docs/features/popular.md`). `discovery.routes.ts` aún no recibe `auth`.
- `createOptionalAuthenticate(auth)` existe en `auth.middleware.ts`: sin header Authorization deja pasar sin usuario, y con un header inválido responde 401. Deja `res.locals.user` (y `req.user`). Reading ya lo usa así.
- Tablas: `"Favorite"(userId, workId)` y `"WorkGenre"(workId, genreId)`, con índice `[genreId, workId]`. Las columnas van en camelCase entre comillas, sin `@map`.
- Colisiones: `app.ts` monta `discoveryRouter` antes de catalog y reading, así que `/works/recommended` le gana a `/works/:workId`. No choca con `/works/popular` porque es un literal distinto.

## Alcance

Dentro: `GET /api/works/recommended` (P1). Fuera: paginación, `typeId`, `period` y cambios de schema, media y `app.ts`.

## API

GET `/api/works/recommended`. Es pública con Bearer opcional; si se manda, se valida.
Query: `limit?` 1..50 (default 12). Se rechazan las claves desconocidas, incluida `userId`.
Response: `{ success, code: 200, data: RecommendedWorks }`, con `RecommendedWorks = { basis: "genres" | "popular"; items: PopularWork[] }`.
- Con sesión se excluyen los favoritos del usuario. Orden: `matched desc, visits(all) desc, publishedAt desc nulls last, id desc`. Solo obras PUBLISHED y no eliminadas.
- `basis = "genres"` si el usuario tiene al menos un favorito con algún género. Si no, o sin sesión, `basis = "popular"`.
- Sin sesión: `matched = 0` y sin exclusión, es decir, el mismo orden que `popular?period=all`.
Errores: 400 query inválida, 401 token inválido o header mal formado.

## Pipeline de middlewares

`GET /works/recommended` → `optionalAuthenticate` (solo en esta ruta, nunca `router.use`) → `controller.listRecommendedWorks`. El servicio valida `req.query`, igual que popular.

## Persistencia

Solo lectura en PostgreSQL. No hay Mongo ni Blob, ni migraciones, ni índices nuevos. No hace falta plan de recuperación.

Query recomendada (una sola query raw, con `userId ?? null` parametrizado; con `null`, `matched = 0` y `NOT EXISTS` es siempre verdadero):

```ts
const uid = userId ?? null;
const [rows, withGenres] = await this.client.$transaction([
  this.client.$queryRaw<{ id: string; visits: bigint }[]>`
    SELECT w."id",
      (SELECT COUNT(*) FROM "WorkVisitEvent" v WHERE v."workId" = w."id") AS visits,
      (SELECT COUNT(*) FROM "WorkGenre" wg WHERE wg."workId" = w."id" AND wg."genreId" IN (
        SELECT fg."genreId" FROM "Favorite" f JOIN "WorkGenre" fg ON fg."workId" = f."workId"
        WHERE f."userId" = ${uid}::uuid)) AS matched
    FROM "Work" w
    WHERE w."publicationStatus" = 'PUBLISHED' AND w."deletedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "Favorite" f WHERE f."workId" = w."id" AND f."userId" = ${uid}::uuid)
    ORDER BY matched DESC, visits DESC, w."publishedAt" DESC NULLS LAST, w."id" DESC
    LIMIT ${limit}`,
  this.client.favorite.count({ where: { userId: uid ?? undefined, work: { genres: { some: {} } } } }) // solo si hay userId; si no, 0
]);
```

- Se usan subconsultas escalares en vez de dos LEFT JOIN, para que `visits` no se multiplique por los géneros.
- `basis` sale del `count`, no de `rows`: un usuario cuyos géneros solo aparecen en sus propios favoritos sigue teniendo `basis = "genres"`.
- Sin `userId` no se ejecuta el `count`: `basis = "popular"`. Ojo, `userId: undefined` en Prisma significa "sin filtro".
- **Refactor (sí):** extraer `private async hydrate(rows: { id: string; visits: bigint }[]): Promise<PopularWork[]>` con el `findMany(summarySelect)` + `Map` + `flatMap` de `listPopularWorks`, y usarlo en las dos rutas. El comportamiento de popular no cambia.

## Contratos compartidos

`src/types/discovery.types.ts` (db):

```ts
export interface RecommendedWorks { basis: "genres" | "popular"; items: PopularWork[] }
export interface RecommendedWorksQuery { userId?: string; limit: number }
// en DiscoveryRepositoryContract:
listRecommendedWorks(query: RecommendedWorksQuery): Promise<RecommendedWorks>;
```

`dev`:
- `recommendedWorksQuerySchema = Joi.object({ limit: Joi.number().integer().min(1).max(50).default(12) }).unknown(false).default({})`
- `DiscoveryService.listRecommendedWorks(input: unknown, userId?: string): Promise<RecommendedWorks>` valida `{ limit }` y llama a `repository.listRecommendedWorks({ userId, limit })`.
- `DiscoveryController.listRecommendedWorks` → `this.service.listRecommendedWorks(req.query, res.locals.user?.id)`.
- `createDiscoveryRouter(service = discoveryService, auth: Pick<AuthService, "authenticateToken"> = authService)`, con `router.get("/works/recommended", createOptionalAuthenticate(auth), controller.listRecommendedWorks)`.

## Tareas

### TASK-01
Responsable: db
Archivos propios: `src/types/discovery.types.ts`, `src/repositories/discovery/discovery.repository.ts`
Dependencias: ninguna.
Criterios de aceptación: `tsc --noEmit` OK. Hay una sola query raw con `userId` parametrizado (`::uuid`, sin interpolar strings). `run("Unable to list recommended works", …)`. Se aplica el refactor `hydrate` y `listPopularWorks` devuelve lo mismo que antes. `visits` es `number`.

### TASK-02
Responsable: dev
Archivos propios: `src/middlewares/schemas/discovery.schema.ts`, `src/services/discovery/discovery.service.ts`, `src/controllers/discovery/discovery.controller.ts`, `src/routes/discovery.routes.ts`, `openapi.yaml`
Dependencias: TASK-01.
Criterios de aceptación: `tsc --noEmit` y `npm run build` OK. `app.ts` no cambia. `openapi.yaml` documenta la ruta con `bearerAuth` opcional y el schema `RecommendedWorks`. latest y popular siguen sin auth.

## Plan de pruebas

Con `B=http://localhost:3000/api`:
1. Sin sesión: `curl "$B/works/recommended"` → 200, `basis="popular"`, y los ids salen en el mismo orden que los primeros 12 de `$B/works/popular`.
2. Login de un usuario sin favoritos → `basis="popular"`, mismo orden que en el caso 1.
3. El mismo usuario marca A como favorita (`PUT $B/me/favorites/<A>`, A con género Acción). Con E en Acción, `GET` con su Bearer → `basis="genres"`, E antes que las obras sin Acción y A ausente.
4. `?limit=3` → como máximo 3 items.
5. Casos negativos: `Authorization: Bearer xxx` → 401; `Authorization: Basic x` → 401; `?limit=51`, `?limit=0`, `?userId=<uuid>`, `?page=2` → 400.
6. Regresión: `$B/works/popular`, `$B/chapters/latest` y `$B/works/<id>` responden igual que antes.
7. Limpieza: `DELETE $B/me/favorites/<A>`.

## Riesgos

- Por cada obra visible corre un COUNT de visitas y otro de géneros: O(obras × eventos). Alcanza para el MVP; el contador materializado ya quedó anotado en popular.
- Los favoritos de obras despublicadas también aportan géneros. Es aceptable porque el contrato habla de "obras favoritas" sin filtro. No es una decisión estructural, así que no hace falta `architect`.

## Integración

Rama: `feat/recommended` (sale de `dev`). Build, tests y revisión: pendientes.

## Integración
- Rama: feat/recommended. tsc y build OK. Reviewer sin MEDIA+. Security: ALTA (error handler de app.ts borrado en 4fb4833 → 401/400 en HTML con stack) corregido en ronda 1 restaurando el handler de 6278c45; BAJA Cache-Control/Vary aplicado. Test curl contra Postgres local en Docker: 19/19 ✅.
