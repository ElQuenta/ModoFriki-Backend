# Contrato de la API — ModoFriki (MVP)

Es el **único acuerdo** entre el backend y el frontend:
- El backend implementa exactamente estas rutas y formas.
- El frontend las consume con los tipos de dominio de `ModoFriki-Web/src/types/index.ts` y los DTO de `src/services/*`.

Si algo tiene que cambiar, se avisa al otro y se actualiza este archivo antes de cambiar el código.

**Prioridad:** **P1** = MVP de hoy · **P2** = si da el tiempo.

El contrato implementado de obras, capítulos y archivos se especifica en «Catálogo implementado» al final. Sustituye las propuestas anteriores de este documento para esas rutas, modelos y límites. Favoritos, lecturas, puntuaciones y visitas siguen fuera de este módulo.

El contrato de biblioteca, visitas y actividad implementado se describe en «Biblioteca y actividad de lectura» al final de este archivo y sustituye las propuestas anteriores de favoritos y vistas.

## Convenciones
- Base: `/api`. JSON en camelCase. Los ids son `string` UUID en PostgreSQL y Community MongoDB. Las fechas, `string` ISO 8601.
- Respuesta OK: `{ "success": true, "code": 200, "data": <T> }`. Error: `{ "success": false, "code": 4xx, "error": { "message": "..." } }`.
- Paginados futuros de catálogo: query `?page=1&limit=20` (`limit` máximo 50), `Paginated<T>`. Community usa `CursorPage<T>` y limit máximo 100, según contrato siguiente.
- Auth: header `Authorization: Bearer <token>` (JWT de 7 días). Códigos: 401 sin token o token inválido, 403 sin rol, 404 no existe, 409 duplicado (email, username, slug).
- CORS restringido a `http://localhost:5173` y al origen de `FRONTEND_URL` (variable de entorno del backend en Render). Otros orígenes no reciben `Access-Control-Allow-Origin`.

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
interface LatestChapter extends ChapterSummary { work: { id: string; slug: string; title: string; coverUrl: string } }   // SUSTITUIDA: ver «Novedades y rankings (P1)»
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

> **Filas históricas:** las de `works`, `chapters`, `favorites` y `users` de esta tabla son la propuesta original. Lo implementado está en «Catálogo implementado», «Biblioteca y actividad de lectura» y «Novedades y rankings (P1)» (por ejemplo, obras por `workId` y no por `slug`, listas como array con `limit` máximo 100 y favoritos en `/api/me/favorites`). La colección `postman/ModoFriki-API.postman_collection.json` prueba el comportamiento real.

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
| P1 | GET | /api/auth/me/comment-restriction | user | — | restricción propia sin actor, evidencia ni historial |
| P1 | GET | /api/genres | — | — | `Genre[]` |
| P1 | GET | /api/tags | — | — | `Tag[]` |
| P1 | GET | /api/works | — | `search?, type?, status?, genre?` (slug), `tag?` (slug), `sort?=latest\|popular`, `page, limit` | `Paginated<WorkSummary>` |
| P1 | GET | /api/works/:slug | — | — | `WorkDetail` |
| P1 | GET | /api/works/:workId/chapters | — | — | `ChapterSummary[]` (por `number` descendente) |
| P1 | GET | /api/chapters/latest | — | `limit?` (default 12) | ~~`LatestChapter[]`~~ → ver «Novedades y rankings (P1)» |
| P1 | GET | /api/chapters/:id | — | — | `ChapterDetail` (suma 1 a `views`) |
| P1 | GET | /api/favorites/me | user | `status?` | `Favorite[]` |
| P1 | PUT | /api/favorites/:workId | user | `{ status, lastReadChapter? }` | `Favorite` (upsert) |
| P1 | DELETE | /api/favorites/:workId | user | — | 204 |
| P1 | GET | /api/comments | —, Bearer opcional validado | Un selector: `targetType,targetId` o `parentCommentId` o `rootCommentId`; cursor, limit | `CursorPage<Comment>` |
| P1 | POST | /api/comments | user | Raíz `{ targetType, targetId, bodyMarkdown }` o respuesta `{ parentCommentId, bodyMarkdown }` | `Comment` (201) |
| P1 | GET/POST | /api/admin/users/:userId/comment-sanctions | ADMIN | historial/cursor o `{ reason, endsAt, evidence? }` | historial / sanción (201) |
| P1 | PUT | /api/admin/users/:userId/comment-sanctions/:sanctionId/revocation | ADMIN | `{}` | sanción revocada |
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

Las creaciones aceptan `Idempotency-Key` UUID opcional. Una misma clave y solicitud reproduce el resultado; reutilizarla con otra solicitud devuelve 409. Mientras SQL y Mongo confirman la publicación, el contenido queda oculto. Una sanción devuelve 403 sin cerrar sesión; un resultado no verificable devuelve 503. El cursor avanza por candidatos examinados, por lo que una página puede quedar vacía con `hasMore: true`; refrescar desde la primera página incorpora confirmaciones tardías.

El reintento COMMITTED recupera el mismo identificador con su contenido vigente, incluso tras edición o borrado lógico; no repone el texto original ni vuelve a tocar el padre. `endsAt` de sanciones exige un instante UTC canónico `YYYY-MM-DDTHH:mm:ss.sssZ` real o `null`; una fecha inexistente o sin zona se rechaza. La evidencia opcional se resuelve mediante los mismos repositorios que verifican visibilidad de comentarios/reportes.

`readingImages` pertenece al detalle GET de capítulo (`CatalogChapterDetail`); los listados y respuestas de mutación conservan `CatalogChapter`. La validación multimedia comprueba estructura, MIME y decodificación antes de Blob, secuencialmente, con un máximo de 40 millones de píxeles por imagen y salida de validación acotada. Se reutiliza Sharp, ya instalado para miniaturas.
| P2 | PATCH / DELETE | /api/works/:id | admin | los mismos campos de POST, todos opcionales | `WorkDetail` / 204 |
| P2 | DELETE | /api/chapters/:id | admin | — | 204 |
| P2 | POST / PATCH / DELETE | /api/genres[/:id], /api/tags[/:id] | admin | `{ name }` | `Genre` / `Tag` / 204 |

## Seed de administrador

Ejecutar `npm run prisma:seed` (equivalente a `npx prisma db seed`) después de aplicar las migraciones y generar el cliente Prisma. Crea el usuario `angeloquenta`, correo `angeloquenta@gmail.com`, rol ADMIN, estado ACTIVE y zona America/La_Paz. La contraseña acordada se guarda únicamente como hash bcrypt con coste 12 en el seed; no se registra en logs.

El seed es repetible por correo normalizado: si la cuenta existe, conserva su identificador y nombre de usuario, restaura la contraseña inicial y la deja ADMIN/ACTIVE, sin duplicarla. No crea obras ni capítulos. Usa la configuración de entorno existente y no conecta a MongoDB. El login acepta contraseñas existentes no vacías de hasta 72 bytes; el registro conserva el mínimo de 8 caracteres.

## Persistencia (referencia para el backend)
- **PostgreSQL (Prisma):** User, Work (n-n con Genre y Tag), Chapter (`@@unique([workId, number])`, `pages String[]`), Genre, Tag y Favorite (PK `userId + workId`).
- **MongoDB:** Comment, CommentVote y CommentReport existentes, con UUID string y documentos independientes. La identidad de autores se consulta en PostgreSQL.
- **Vercel Blob:** `works/` (portadas), `chapters/<workId>/<number>/` (páginas) y `avatars/`.

## Catálogo implementado

Prefijo `/api`. IDs UUID completos. ADMIN crea obras y taxonomías; ADMIN o EDITOR con asignación vigente edita la obra y sus capítulos. GET sin sesión devuelve solo publicaciones; bearer opcional permite a personal autorizado consultar detalles de borradores. Listas con `includeDrafts=true` requieren personal autorizado; EDITOR ve borradores de obras asignadas. No se registran visitas ni lecturas.

Listas: `page=1`, `limit=20` (máximo 100), `search`, `typeId`, `genreId`, `includeDrafts=false`. Devuelven un array en `data`, sin total calculado. Obras ordenadas por creación descendente e ID; capítulos por número ascendente.

| Método | Ruta | Cuerpo / comportamiento |
| --- | --- | --- |
| GET / POST | `/works` | POST `title`, `synopsis`, `typeId`, `publicationStatus?`, `releaseStatus?`, `alternativeTitles?`, `genreIds?`; archivos `cover?`, `banner?`, `inpagecover?` |
| GET / PUT / PATCH / DELETE | `/works/:workId` | PUT/PATCH campos parciales anteriores y `expectedUpdatedAt` ISO obligatorio; DELETE solo `expectedUpdatedAt` |
| GET / POST | `/works/:workId/chapters` | POST `number`, `title?`, `kind?`, `status?`; archivos repetidos `pages` |
| GET / PUT / PATCH / DELETE | `/works/:workId/chapters/:chapterId` | PUT/PATCH campos parciales de capítulo y `expectedVersion` obligatorio; si se adjuntan `pages`, reemplazan todas; DELETE solo `expectedVersion` |
| PUT | `/works/:workId/chapters/:chapterId/pages` | `expectedVersion` y uno o más archivos `pages`; reemplaza el conjunto completo |
| POST | `/works/:workId/chapters/:chapterId/pages` | `expectedVersion`, `position` desde 1 y archivos `pages`; inserta y renumera |
| PATCH | `/works/:workId/chapters/:chapterId/pages` | JSON `expectedVersion`, `pageIds` como permutación exacta de todos los IDs actuales; copia y renumera |
| GET / POST | `/work-types`, `/genres` | POST exclusivo ADMIN: `{name, slug}` |

PUT/PATCH de obra o capítulo admite JSON sin archivos: conserva todos los medios. Multipart admite adjuntos opcionales; cada archivo de portada enviado reemplaza solo ese campo. Arrays multipart (`alternativeTitles`, `genreIds`) son texto JSON, por ejemplo `genreIds='["uuid"]'`. Enviar páginas como campos repetidos `pages`, sin corchetes. Los endpoints específicos de reemplazo/inserción requieren archivos.

Enums: `publicationStatus`/`status` = DRAFT o PUBLISHED; `releaseStatus` = ONGOING, COMPLETED, HIATUS o CANCELLED; `kind` = NORMAL, EXTRA o ANNOUNCEMENT. `number` decimal no negativo, hasta nueve enteros y tres decimales (preferir string). La primera publicación posterior a esta migración requiere `cover`, `banner` e `inpagecover`; un borrador puede ser incompleto. Las obras publicadas antes de la migración conservan su exención interna y pueden completarse sin bloqueo retroactivo. Publicar capítulo requiere páginas y obra publicada.

Límites: JPEG, PNG y WebP verificados por contenido, 10 MiB por archivo, 100 MiB total, 100 páginas por solicitud y 1000 por capítulo. Un archivo máximo por `cover`, `banner` e `inpagecover`. La imagen inicial pertenece a la obra y se comparte entre sus capítulos; se devuelve como `incapBannerAsset`. El banner de ficha se devuelve como `bannerAsset` y no participa en la lectura.

Los DTO reflejan relaciones persistidas: obra con `type`, `coverAsset`, `bannerAsset`, `coverThumbAsset` (miniatura WebP de 300 px o null), `incapBannerAsset`, `alternativeTitles`, `genres[].genre`; capítulo con `pages[].asset`, `position` y `readingImages`. Esta secuencia antepone una entrada `WORK_OPENING` con `pageId`/`position` null cuando existe apertura y sigue con entradas `PAGE`; `pages` permanece como la lista editorial. Fechas ISO y `Chapter.number` como string. Nunca se exponen campos internos: `createdById`, `updatedById`, `deletedAt`, `coverAssetId`, `bannerAssetId`, `incapBannerAssetId`, `legacyPublicationImagesExempt`, `assetId`, ni `pathname`/`sizeBytes` de los assets (`catalogDto` en `catalog.controller.ts`). Tras crear/editar usar el nuevo `updatedAt` o `version` en la siguiente mutación. `pageIds` cambia al reconstruir páginas: recargar la respuesta tras cada edición. Errores 400 validación, 401 sesión, 403 permiso, 404 recurso oculto/inexistente, 409 versión/número/ruta en conflicto, 413 límites, 415 contenido, 503 almacenamiento no configurado.

El detalle del capítulo devuelve `readingImages`: usar esta secuencia para leer y conservar `pages` solo para edición. Así la apertura no se duplica ni cambia posiciones editoriales. El middleware rechaza contenido de imagen inválido o MIME discordante con 400; 415 identifica formatos de páginas persistidas que no pueden reutilizarse. Un fallo inesperado del proveedor devuelve 500 sin su mensaje original.

Un mensaje final se adjunta como la última imagen multipart `pages` mediante las operaciones habituales de creación, reemplazo, inserción o reordenamiento. No existe campo, endpoint, modelo ni inserción automática de cierre; su posición se conserva como cualquier otra página y cuenta para los límites de 100 páginas por solicitud y 1000 por capítulo. `SiteSettings.generalBannerAsset` no participa en este flujo.

Carpeta estable de obra: `<slug-titulo>-<uuid4>/Covers/<uuid4>.<ext>`, `Banners/<uuid4>.<ext>` y `CoverPage/<uuid4>.<ext>`; capítulo: `<slug-obra>/Chapter-<chapterUuid4>/<uuid4>-<position>.<ext>`. Abreviaciones de cuatro caracteres generadas por servidor; editar título conserva carpeta. Una colisión devuelve 409 y requiere reintentar; nunca sobrescribe archivos. Insertar/reordenar copia páginas a nombres nuevos antes de confirmar la nueva secuencia. Solo al confirmar una nueva generación de páginas de un capítulo se borran sus archivos anteriores sin referencias. Esto incluye resubida completa, inserción y reordenamiento. Editar metadatos, cambiar portadas o retirar recursos no borra archivos en Blob. Fallos abandonan el lote y las reservas se mantienen ocultas para recuperación.

La recepción con Multer, la validación y las operaciones `put`/`copy`/`del` de Blob se ejecutan en middlewares. El servicio construye el plan de negocio y los repositorios confirman las referencias. La limpieza de huérfanos es un proceso aparte (`npm run media:cleanup`, ver más abajo); el pipeline no borra nada por vencimiento. Los archivos vencidos, abandonados o de subidas fallidas se conservan hasta esa limpieza; al realizar una nueva mutación se liberan únicamente las reservas vencidas en PostgreSQL. El middleware de borrado se ejecuta después del commit de páginas, comprueba que los archivos pertenecen al capítulo y que no tienen referencias, y borra solo la generación sustituida. Si Blob rechaza ese borrado, se conserva la nueva versión confirmada y se registra un warning; no se programa un reintento automático. Los temporales locales de Multer se retiran al terminar la petición. Una creación de capítulo fallida puede reusar su reserva oculta al reintentar el mismo número; un capítulo confirmado y luego eliminado conserva ese número.

**Miniaturas (`npm run media:thumbnails`):** genera una WebP de 300 px de ancho por portada (sin agrandar) en la misma carpeta `Covers/`, y la enlaza en `Work.coverThumbAssetId` solo si la portada sigue siendo la misma (sin tocar `updatedAt`). Se regenera cuando la portada cambia; la anterior queda huérfana para la limpieza. Los resúmenes (`WorkRef`, biblioteca) exponen `thumbUrl`; si es null, usar `coverUrl`. Workflow `media-thumbnails.yml`, cada hora. Solo agrega archivos, nunca borra.

**Limpieza de huérfanos (`npm run media:cleanup`):** por defecto solo lista (dry-run); con `-- --apply` crea un `MediaCleanupJob` por archivo y lo borra de Blob con reintentos (máx. 5, espera 2/4/8/16 min). Candidatos: `MediaAsset` sin página, portada, banner ni ajustes y con más de 24 h, y `UploadObject` sin asset de lotes ABANDONED o PENDING vencidos hace más de 24 h. Nunca toca lotes PENDING vigentes. Justo antes de borrar vuelve a comprobar que nada lo referencia (si no, `COMPLETED` con `REFERENCED`) y valida la ruta con `assertMediaPath`. El asset queda `DELETING` y sus `UploadObject` `CLEANED`. Workflow `media-cleanup.yml`: diario en dry-run; borra solo si la variable del repo `MEDIA_CLEANUP_APPLY` es `true` o se lanza a mano con `apply`.

El almacenamiento Blob configurado por este pipeline es público: ocultar un borrador en la API no vuelve privadas sus URLs. Las imágenes se validan por firma y estructura (PNG también verifica su raster); JPEG/WebP no se decodifican completamente. Para verificar el proveedor se necesita un almacén de pruebas con `BLOB_READ_WRITE_TOKEN`; las pruebas automatizadas simulan Blob y no usan credenciales reales.

## Biblioteca y actividad de lectura

Este contrato sustituye las propuestas antiguas de favoritos y conteo de vistas. Todas las rutas usan la base `/api`, los envelopes existentes y UUID v4. Todas las cuentas ACTIVE (BASIC, EDITOR, ADMIN) acceden únicamente a su biblioteca desde el token; no se acepta userId del cliente.

| Método | Ruta | Auth | Entrada / resultado data |
| --- | --- | --- | --- |
| POST | /works/:workId/visits | Opcional | Body `{idempotencyKey: UUID}`; `{counted,occurredAt}` |
| GET | /works/:workId/stats | Pública | `{workId,visits,visitsLast24Hours,reads,readsLast24Hours,favorites,ratings,averageRating}` |
| POST | /chapters/:chapterId/read-events | Opcional | Body `{idempotencyKey: UUID}`; `{counted,occurredAt,isRead?}` |
| PUT | /me/read-chapters/:chapterId | Obligatoria | Sin body; estado leído `{chapterId,isRead,firstReadAt,lastReadAt}` |
| DELETE | /me/read-chapters/:chapterId | Obligatoria | Desmarcar, respuesta 204 |
| GET | /me/favorites | Obligatoria | Query page/limit; página de `{work,createdAt}` |
| PUT | /me/favorites/:workId | Obligatoria | Sin body; `{workId,isFavorite:true}` |
| DELETE | /me/favorites/:workId | Obligatoria | Retirar, respuesta 204 |
| PUT | /works/:workId/rating | Obligatoria | Body `{score:0..5}` en pasos de 0.5; `{workId,score}` |
| DELETE | /works/:workId/rating | Obligatoria | Retirar valoración, respuesta 204 |
| GET | /me/reading-history | Obligatoria | Query page/limit; estados leídos con capítulo y obra |
| GET | /me/works/:workId/progress | Obligatoria | Query page/limit para capítulos; favorito, score, progreso |
| GET | /me/reading-calendar | Obligatoria | Query from/to YYYY-MM-DD; `{timezone,from,to,days:[{date,chaptersRead}]}` |
| GET | /me/reading-stats | Obligatoria | Cantidades de lectura y rachas del usuario |

Páginas: `{items,total,page,limit}`, page por defecto 1 (máximo 100000), limit por defecto 20 (máximo 100). Resumen de obra: `{id,title,slug,coverUrl}`. Historial: `{chapterId,isRead,firstReadAt,lastReadAt,work,chapter:{id,number,title}}`; number es decimal serializado como string. Progreso: `{workId,isFavorite,score,totalChapters,readChapters,completionPercentage,chapters:{items,total,page,limit}}`; cada capítulo incluye id, número, título y estado de lectura. Solo se listan obras y capítulos publicados y no eliminados. Los DELETE permiten retirar relaciones propias aunque el contenido ya esté oculto.

Estadísticas propias: `{markedReadChapters,favorites,recordedReads,activeDays,readsToday,readsLast7Days,readsLast30Days,currentStreak,longestStreak,lastReadingDate,timezone}`. Las lecturas registradas incluyen relecturas en días distintos; markedReadChapters representa el estado actual. Calendario permite como máximo 366 días inclusivos; por defecto muestra los últimos 365 días en la zona del usuario. Las fechas de actividad conservan el día local y zona al crear el evento. La racha actual termina hoy o ayer; la máxima comprende toda la actividad registrada. No se mide tiempo de lectura ni se infiere cuánto tardó el usuario.

### Integración del lector

1. Al abrir una ficha, el frontend obtiene la obra por GET y envía POST a su endpoint visits.
2. Al entrar a leer un capítulo, obtiene el capítulo por GET y envía POST a read-events. Genera un UUID por operación y lo conserva para sus reintentos. Con Bearer válido, la operación registra la actividad y marca leído de forma atómica; sin token, registra únicamente una lectura anónima.
3. Para capítulos leídos antes de crear la cuenta, llama PUT /me/read-chapters/:chapterId. Marca el estado sin sumar eventos ni inflar la racha de hoy. Puede repetirlo para cada capítulo seleccionado.
4. Para mostrar los marcadores, consulta el progreso de la obra. Para la biblioteca y panel personal, usa favorites, reading-history, reading-calendar y reading-stats.

Los GET de catálogo no escriben eventos. La apertura se registra mediante el POST del cliente. No se requiere haber descargado todas las páginas para marcar leído. Las fechas firstReadAt/lastReadAt de un marcado manual indican cuándo se registró ese estado, no una fecha histórica de lectura conocida. No se aceptan fechas de lectura del cliente. El calendario incluye los días sin actividad con cero.

Despliegue: aplicar primero la migración aditiva de ChapterReadReceipt con el procedimiento de migraciones del proyecto y regenerar el cliente Prisma. Esta entrega prepara la migración, sin ejecutarla contra la base de datos. Los recibos conservan también las claves de aperturas deduplicadas por día; no eliminarlos como mecanismo de limpieza, pues se perdería la garantía de reintento.

Una clave de operación repetida no suma otra visita/lectura. Reutilizarla en otro destino o contexto de identidad devuelve 409. Para registrados, solo un evento por capítulo y día local contribuye a estadísticas y racha. Desmarcar no borra los eventos históricos; un reintento de un evento previo tampoco restaura un estado desmarcado. Favoritos y valoraciones son únicos por usuario/obra. Score cero es válido y sin valoraciones averageRating es null. Las métricas de 24 horas usan una ventana móvil UTC. Las lecturas anónimas son eventos aceptados, no personas únicas verificadas; la idempotencia no impide fabricar nuevas operaciones.

Errores: 400 entrada/UUID/fecha/rango inválidos; 401 token ausente en rutas privadas o inválido en autenticación opcional; 404 destino no publicado/inexistente; 409 clave reutilizada en otro contexto o conflicto concurrente; 500 error interno seguro. No se expone identidad de lectores en estadísticas públicas.

## Novedades y rankings (P1)

Esta sección sustituye la fila `GET /api/chapters/latest` de la tabla de Endpoints. Rutas públicas bajo `/api`, con los envelopes existentes. `WorkRef` es el resumen de obra del módulo de lectura.

```ts
interface WorkRef { id: string; slug: string; title: string; coverUrl: string | null }
interface LatestChapter {
  id: string; workId: string; number: string;   // decimal serializado
  title: string | null; kind: "NORMAL" | "EXTRA" | "ANNOUNCEMENT";
  publishedAt: string; work: WorkRef;
}
```

| P | Método | Ruta | Auth | Query | `data` |
|---|---|---|---|---|---|
| P1 | GET | /api/chapters/latest | — | `page?` (default 1, máximo 100000), `limit?` (default 12, máximo 50), `typeId?` (UUID de `/api/work-types`) | `Paginated<LatestChapter>` |

Solo capítulos PUBLISHED y no eliminados de obras PUBLISHED y no eliminadas, ordenados por `publishedAt` descendente e `id`. `typeId` inexistente devuelve una página vacía. Errores: 400 query inválida (UUID, page/limit fuera de rango, claves desconocidas).

```ts
interface PopularWork { work: WorkRef; visits: number }
```

| P | Método | Ruta | Auth | Query | `data` |
|---|---|---|---|---|---|
| P1 | GET | /api/works/popular | — | `period?=all\|day` (default `all`), `page?` (default 1, máximo 100000), `limit?` (default 12, máximo 50), `typeId?` | `Paginated<PopularWork>` |

`visits` cuenta los `POST /works/:workId/visits` aceptados: `all` desde siempre, `day` en las últimas 24 horas (ventana móvil UTC, igual que `visitsLast24Hours`). Incluye todas las obras PUBLISHED y no eliminadas, también con 0 visitas, ordenadas por `visits` descendente, `publishedAt` descendente e `id`. Errores: 400 query inválida.

```ts
interface RecommendedWorks { basis: "genres" | "popular"; items: PopularWork[] }
```

| P | Método | Ruta | Auth | Query | `data` |
|---|---|---|---|---|---|
| P1 | GET | /api/works/recommended | —, Bearer opcional validado | `limit?` (default 12, máximo 50) | `RecommendedWorks` |

Con sesión se toman los géneros de las obras favoritas del usuario (el id sale del token; no se acepta `userId`). Se excluyen sus favoritos y se ordenan las obras PUBLISHED y no eliminadas por cantidad de géneros coincidentes descendente y después como `popular` con `period=all` (`visits` total, `publishedAt`, `id`). `basis` es `"genres"` si el usuario tiene al menos un favorito con géneros; si no, o sin sesión, `"popular"` y el orden es el de `popular`. Errores: 400 query inválida, 401 token inválido.

## Administración de roles y asignaciones (P1)

Todas las rutas requieren Bearer de una cuenta `ADMIN` activa. La autorización se vuelve a comprobar en PostgreSQL dentro de las mutaciones. No existen rutas administrativas para crear, eliminar o promover cuentas `ADMIN`.

```ts
interface AdminUser {
  id: string; username: string; role: "BASIC" | "EDITOR" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED"; createdAt: string; updatedAt: string;
}
interface WorkEditorAssignment {
  id: string; workId: string; editorId: string; assignedById: string;
  assignedAt: string; createdAt: string; revokedAt: string | null; version: number;
}
interface AdminCursorPage<T> {
  items: T[]; hasMore: boolean;
  nextCursor: { createdAt: string; id: string } | null;
}
```

| Método | Ruta | Query/body | `data` |
|---|---|---|---|
| GET | `/api/admin/users` | `limit?` 1..100 (20), `role?`, `status?`, `cursorCreatedAt?` + `cursorId?` | `AdminCursorPage<AdminUser>` |
| GET | `/api/admin/users/:userId` | — | `AdminUser` |
| PATCH | `/api/admin/users/:userId/role` | `{ role: "BASIC" | "EDITOR", expectedUpdatedAt: ISO UTC con milisegundos }` | `AdminUser` |
| GET | `/api/admin/users/:userId/work-assignments` | `limit?`, `includeRevoked?` (false), cursor completo | `AdminCursorPage<WorkEditorAssignment>` |
| PUT | `/api/admin/users/:userId/work-assignments/:workId` | `{ expectedVersion: integer >= 0 }` | `WorkEditorAssignment` |
| PATCH | `/api/admin/users/:userId/work-assignments/:workId/revocation` | `{ expectedVersion: integer >= 1 }` | `WorkEditorAssignment` |

`expectedUpdatedAt` y `expectedVersion` son precondiciones CAS. Un valor anterior devuelve 409 incluso cuando el estado solicitado ya coincide. Para refrescar el CAS de rol se usa el GET de detalle; para relaciones se vuelve a listar. La primera asignación usa versión esperada 0 y devuelve versión 1. Revocar o reasignar incrementa la versión; `createdAt` conserva la posición histórica del cursor y `assignedAt` registra la asignación más reciente. Degradar un editor a BASIC revoca atómicamente todas sus relaciones activas y genera auditoría.

Errores: 400 entrada desconocida, cursor incompleto o formato inválido; 401 autenticación ausente/inválida; 403 cuenta no ADMIN activa, intento de modificar ADMIN o editor no apto; 404 usuario, obra o relación inexistente; 409 precondición obsoleta/conflicto concurrente; 503 persistencia administrativa no disponible. Las respuestas nunca incluyen email, normalizados ni hash de contraseña.
