# Contrato de la API — ModoFriki (MVP)

Es el **único acuerdo** entre el backend y el frontend:
- El backend implementa exactamente estas rutas y formas.
- El frontend las consume con los tipos de `ModoFriki-Web/src/shared/types.ts`, usando mocks hasta que el backend esté listo.

Si algo tiene que cambiar, se avisa al otro y se actualiza este archivo antes de cambiar el código.

**Prioridad:** **P1** = MVP de hoy · **P2** = si da el tiempo.

## Convenciones
- Base: `/api`. JSON en camelCase. Los ids son `string` UUID en PostgreSQL y Community MongoDB. Las fechas, `string` ISO 8601.
- Respuesta OK: `{ "success": true, "code": 200, "data": <T> }`. Error: `{ "success": false, "code": 4xx, "error": { "message": "..." } }`.
- Paginados futuros de catálogo: query `?page=1&limit=20` (`limit` máximo 50), `Paginated<T>`. Community usa `CursorPage<T>` y limit máximo 100, según contrato siguiente.
- Auth: header `Authorization: Bearer <token>` (JWT de 7 días). Códigos: 401 sin token o token inválido, 403 sin rol, 404 no existe, 409 duplicado (email, username, slug).
- CORS habilitado para `http://localhost:5173` y para el dominio del frontend desplegado.

## Formas de `data`
```ts
type Role = "BASIC" | "EDITOR" | "ADMIN";
type WorkType = "MANHWA" | "MANHUA" | "MANGA" | "NOVELA";
type WorkStatus = "ACTIVO" | "FINALIZADO" | "PAUSA";
type FavoriteStatus = "LEYENDO" | "POR_LEER" | "COMPLETADO" | "PAUSA";

interface Paginated<T> { items: T[]; total: number; page: number; limit: number }

interface User { id: string; username: string; email: string; role: Role; timezone: string; createdAt: string }
type PublicUser = Omit<User, "email">;
interface AuthResult { user: User; token: string }

interface Genre { id: string; name: string; slug: string }   // Tag tiene la misma forma
interface Tag { id: string; name: string; slug: string }

interface WorkSummary {
  id: string; slug: string; title: string; coverUrl: string;
  type: WorkType; status: WorkStatus; views: number; updatedAt: string;
  genres: Genre[]; chaptersCount: number;
}
interface WorkDetail extends WorkSummary {
  synopsis: string; bannerUrl: string | null; author: string; artist: string | null;
  tags: Tag[]; createdAt: string;
}

interface ChapterSummary { id: string; workId: string; number: number; title: string | null; views: number; createdAt: string }
interface LatestChapter extends ChapterSummary { work: { id: string; slug: string; title: string; coverUrl: string } }
interface ChapterDetail extends ChapterSummary {
  pages: string[];                 // URLs de imágenes en orden
  prevId: string | null; nextId: string | null;
  work: { id: string; slug: string; title: string };
}

interface Favorite { workId: string; status: FavoriteStatus; lastReadChapter: number | null; createdAt: string; work: WorkSummary }

interface Comment {
  id: string; author: { id: string; username: string } | null;
  targetType: "WORK" | "CHAPTER"; targetId: string;
  parentCommentId: string | null; rootCommentId: string;
  bodyMarkdown: string | null; status: "ACTIVE" | "DELETED"; revision: number;
  createdAt: string; editedAt: string | null;
  votes: { upvotes: number; downvotes: number; score: number };
}
interface CursorPage<T> { items: T[]; hasMore: boolean; nextCursor: { createdAt: string; id: string } | null }
interface Report { id: string; commentId: string; reason: "SPAM" | "HARASSMENT" | "HATE" | "SPOILER" | "OTHER"; details: string | null; status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED"; createdAt: string }
interface ModerationReport extends Report { reporterId: string; reviewedById: string | null; reviewedAt: string | null; resolution: string | null; updatedAt: string }
```

## Endpoints

Auth y Community de esta tabla se implementan en esta feature; las demás rutas describen trabajo futuro. Los esquemas SQL vigentes prevalecen sobre las referencias históricas de catálogo y seed de este documento.

Registro: username tras trim entre 3 y 32 caracteres; email válido hasta 254 caracteres. Se conserva la presentación y se exige unicidad por trim/lowercase. Password sin transformar: mínimo 8 caracteres y máximo 72 bytes UTF-8. timezone es una zona IANA válida; default America/La_Paz. No se aceptan campos desconocidos ni role/status/hash del cliente. Registro siempre BASIC/ACTIVE. Login y rutas protegidas requieren status ACTIVE y deletedAt null; el rol se obtiene de DB cada petición, incluso con JWT anterior.

Community usa UUID para todos los IDs. bodyMarkdown conserva su formato, debe ser no vacío y no superar 10000 caracteres. No se interpreta HTML en backend: el renderer debe sanitizarlo, restringir enlaces y tratar HTML arbitrario como texto. Las respuestas admiten profundidad arbitraria, heredan destino y raíz y se consultan como páginas planas. No hay expansión automática ni arrays de replies/likes. Authors inactivos se muestran como null.

Cursor: `cursorCreatedAt` UTC ISO 8601 (segundos con hasta tres decimales, sufijo Z) y `cursorId` UUID, ambos o ninguno; `limit=20`, entre 1 y 100. Reutilizar `nextCursor.createdAt` y `nextCursor.id` en la siguiente consulta. Orden ascendente `(createdAt,id)`. El selector por raíz incluye la raíz y sus descendientes; por padre sólo hijos directos, aun si el padre es una respuesta. Un selector exacto por consulta; claves desconocidas se rechazan.

Todos los accesos públicos verifican obra PUBLISHED y no eliminada; capítulos además requieren su obra publicada. Autor o ADMIN pueden borrar comentarios en destinos ocultos; ADMIN puede listar/resolver reportes de esos destinos. Borrar conserva nodos y descendientes, status DELETED y bodyMarkdown null. Editar, responder, votar y reportar requieren comentario ACTIVE. Retirar voto es idempotente y admite comentarios eliminados si el destino sigue publicado. EDITOR no modera comentarios ajenos.

`expectedRevision` es entero no negativo. La revisión puede aumentar por respuestas, votos y reportes además de ediciones; una revisión obsoleta produce 409. Un voto por usuario/comentario, PUT sustituye su signo, DELETE lo retira. Un reporte por usuario/comentario; duplicado 409. details opcional y resolution obligatoria son texto no vacío hasta 2000 caracteres. Sólo reportes OPEN/IN_REVIEW pueden cerrarse y resolver no elimina automáticamente el comentario. La respuesta al reportero contiene sólo su reporte; los datos de otros reporteros y de moderación son exclusivos de ADMIN.

Sin esquemas Joi nuevos: el usuario implementará validación de esquemas; los servicios mantienen estas invariantes. Mongo requiere replica set para las transacciones existentes; no hay transacción distribuida SQL/Mongo.

| P | Método | Ruta | Auth | Body / Query | `data` |
|---|---|---|---|---|---|
| P1 | POST | /api/auth/register | — | `{ username, email, password, timezone? }` | `AuthResult` (201) |
| P1 | POST | /api/auth/login | — | `{ email, password }` | `AuthResult` |
| P1 | GET | /api/auth/me | user | — | `User` |
| P1 | GET | /api/genres | — | — | `Genre[]` |
| P1 | GET | /api/tags | — | — | `Tag[]` |
| P1 | GET | /api/works | — | `search?, type?, status?, genre?` (slug), `tag?` (slug), `sort?=latest\|popular`, `page, limit` | `Paginated<WorkSummary>` |
| P1 | GET | /api/works/:slug | — | — | `WorkDetail` |
| P1 | GET | /api/works/:workId/chapters | — | — | `ChapterSummary[]` (por `number` descendente) |
| P1 | GET | /api/chapters/latest | — | `limit?` (default 12) | `LatestChapter[]` |
| P1 | GET | /api/chapters/:id | — | — | `ChapterDetail` (suma 1 a `views`) |
| P1 | GET | /api/favorites/me | user | `status?` | `Favorite[]` |
| P1 | PUT | /api/favorites/:workId | user | `{ status, lastReadChapter? }` | `Favorite` (upsert) |
| P1 | DELETE | /api/favorites/:workId | user | — | 204 |
| P1 | GET | /api/comments | —, Bearer opcional validado | Un selector: `targetType,targetId` o `parentCommentId` o `rootCommentId`; cursor, limit | `CursorPage<Comment>` |
| P1 | POST | /api/comments | user | Raíz `{ targetType, targetId, bodyMarkdown }` o respuesta `{ parentCommentId, bodyMarkdown }` | `Comment` (201) |
| P1 | GET | /api/users/:id | — | — | `PublicUser` |
| P1 | POST | /api/works | admin | multipart: `cover` (imagen ≤ 5 MB), `title, synopsis, type, status, author, artist?, genreIds[], tagIds[]` | `WorkDetail` (201) |
| P1 | POST | /api/works/:workId/chapters | admin | multipart: `pages[]` (imágenes en orden, ≤ 5 MB c/u), `number, title?` | `ChapterDetail` (201) |
| P2 | PATCH | /api/users/me | user | `{ username?, bio? }` | `User` |
| P2 | PUT | /api/users/me/avatar | user | multipart: `avatar` | `User` |
| P1 | PATCH | /api/comments/:id | autor | `{ bodyMarkdown, expectedRevision }` | `Comment` |
| P1 | PUT | /api/comments/:id/vote | user | `{ value: -1 \| 1 }` | `{ commentId, upvotes, downvotes, score }` |
| P1 | DELETE | /api/comments/:id/vote | user | — | 204 idempotente |
| P1 | POST | /api/comments/:id/reports | user | `{ reason, details? }` | `Report` propio (201) |
| P1 | GET | /api/comment-reports | ADMIN | `status?`, cursor, limit | `CursorPage<ModerationReport>` |
| P1 | PATCH | /api/comment-reports/:id | ADMIN | `{ status: "RESOLVED" \| "DISMISSED", resolution }` | `ModerationReport` |
| P2 | DELETE | /api/comments/:id | user (autor o admin) | — | 204 |
| P2 | PATCH / DELETE | /api/works/:id | admin | los mismos campos de POST, todos opcionales | `WorkDetail` / 204 |
| P2 | DELETE | /api/chapters/:id | admin | — | 204 |
| P2 | POST / PATCH / DELETE | /api/genres[/:id], /api/tags[/:id] | admin | `{ name }` | `Genre` / `Tag` / 204 |

## Datos de prueba (seed, P1)
`npx prisma db seed` debe dejar:
- Las obras, géneros y etiquetas de `ModoFriki-Web/design/olympus/src/data/mockData.ts` (con sus portadas de Unsplash).
- 3 capítulos por obra, con páginas de ejemplo (`https://picsum.photos/seed/<obra>-<n>-<p>/800/1200`).
- El usuario admin `admin@modofriki.com` / `Admin12345`.

## Persistencia (referencia para el backend)
- **PostgreSQL (Prisma):** User, Work (n-n con Genre y Tag), Chapter (`@@unique([workId, number])`, `pages String[]`), Genre, Tag y Favorite (PK `userId + workId`).
- **MongoDB:** Comment, CommentVote y CommentReport existentes, con UUID string y documentos independientes. La identidad de autores se consulta en PostgreSQL.
- **Vercel Blob:** `works/` (portadas), `chapters/<workId>/<number>/` (páginas) y `avatars/`.
