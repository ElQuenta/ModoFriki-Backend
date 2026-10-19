# Contrato de la API — ModoFriki (MVP)

Es el **único acuerdo** entre el backend y el frontend:
- El backend implementa exactamente estas rutas y formas.
- El frontend las consume con los tipos de `ModoFriki-Web/src/shared/types.ts`, usando mocks hasta que el backend esté listo.

Si algo tiene que cambiar, se avisa al otro y se actualiza este archivo antes de cambiar el código.

**Prioridad:** **P1** = MVP de hoy · **P2** = si da el tiempo.

## Convenciones
- Base: `/api`. JSON en camelCase. Los ids son `string` (UUID en Postgres, ObjectId en Mongo). Las fechas, `string` ISO 8601.
- Respuesta OK: `{ "success": true, "code": 200, "data": <T> }`. Error: `{ "success": false, "code": 4xx, "error": { "message": "..." } }`.
- Paginados: query `?page=1&limit=20` (`limit` máximo 50), y `data` es `Paginated<T>`.
- Auth: header `Authorization: Bearer <token>` (JWT de 7 días). Códigos: 401 sin token o token inválido, 403 sin rol, 404 no existe, 409 duplicado (email, username, slug).
- CORS habilitado para `http://localhost:5173` y para el dominio del frontend desplegado.

## Formas de `data`
```ts
type Role = "USER" | "ADMIN";
type WorkType = "MANHWA" | "MANHUA" | "MANGA" | "NOVELA";
type WorkStatus = "ACTIVO" | "FINALIZADO" | "PAUSA";
type FavoriteStatus = "LEYENDO" | "POR_LEER" | "COMPLETADO" | "PAUSA";

interface Paginated<T> { items: T[]; total: number; page: number; limit: number }

interface User { id: string; username: string; email: string; avatarUrl: string | null; bio: string | null; role: Role; createdAt: string }
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
  id: string; workId: string; chapterId: string | null; parentId: string | null;
  user: { id: string; username: string; avatarUrl: string | null };
  content: string; isSpoiler: boolean; likes: number; likedByMe: boolean; createdAt: string;
  replies: Comment[];              // solo en comentarios raíz; las respuestas traen []
}
```

## Endpoints

| P | Método | Ruta | Auth | Body / Query | `data` |
|---|---|---|---|---|---|
| P1 | POST | /api/auth/register | — | `{ username, email, password }` (password de 8 caracteres o más) | `AuthResult` (201) |
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
| P1 | GET | /api/comments | — | `workId`, `chapterId?`, `page, limit` | `Paginated<Comment>` (solo raíces, con `replies`) |
| P1 | POST | /api/comments | user | `{ workId, chapterId?, parentId?, content (1–2000), isSpoiler }` | `Comment` (201) |
| P1 | GET | /api/users/:id | — | — | `PublicUser` |
| P1 | POST | /api/works | admin | multipart: `cover` (imagen ≤ 5 MB), `title, synopsis, type, status, author, artist?, genreIds[], tagIds[]` | `WorkDetail` (201) |
| P1 | POST | /api/works/:workId/chapters | admin | multipart: `pages[]` (imágenes en orden, ≤ 5 MB c/u), `number, title?` | `ChapterDetail` (201) |
| P2 | PATCH | /api/users/me | user | `{ username?, bio? }` | `User` |
| P2 | PUT | /api/users/me/avatar | user | multipart: `avatar` | `User` |
| P2 | POST | /api/comments/:id/like | user | — | `{ likes: number, likedByMe: boolean }` (toggle) |
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
- **MongoDB:** Comment (`likes` = array de userIds; `user` desnormalizado al crear).
- **Vercel Blob:** `works/` (portadas), `chapters/<workId>/<number>/` (páginas) y `avatars/`.
