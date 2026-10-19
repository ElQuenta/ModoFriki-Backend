# Propuesta de funcionalidades y modelo de datos

Fecha: 19 de octubre de 2026. Estado: propuesta actualizada para implementar la base de persistencia; las funcionalidades HTTP y los procesos operativos quedan para etapas posteriores. Plan de esta entrega: [PERSISTENCIA_INICIAL.md](PERSISTENCIA_INICIAL.md).

## Objetivo y decisiones de alcance

Definir entidades, relaciones, reglas e identificación antes de implementar catálogo, publicación de capítulos, biblioteca personal, actividad de lectura y comunidad.

Decisiones confirmadas por el usuario:

- Un editor publica y edita capítulos **solo de obras asignadas** por un administrador.
- Todos los tipos de obra, incluidas novelas ligeras, usan **capítulos de imágenes por ahora**.
- Las estadísticas públicas incluyen **lecturas anónimas**. Un visitante no tiene historial personal, favoritos ni progreso persistente en el backend.
- El editor no elimina capítulos. El administrador puede hacerlo y gestionar las obras y asignaciones.
- Comentarios, respuestas, votos y reportes se almacenan en MongoDB; cada comentario es un documento independiente con referencias al padre, la raíz y el destino original.

Propuestas de producto que aún deben ratificarse:

- Calendario y rachas para todos los usuarios registrados; editor y administrador heredan esas funciones.
- Una finalización de capítulo por usuario y día local contribuye al calendario. Relecturas en otros días también contribuyen.
- Desmarcar un capítulo modifica el estado actual, pero conserva la actividad histórica.
- Banner Incap por obra y banner general de toda la plataforma. Ambos se requieren para publicar; el significado exacto de Incap y obligatoriedad se deben confirmar.
- Las ediciones de obras quedan a cargo de administradores; editar capítulos no otorga permiso para cambiar la ficha de la obra.
- Eliminación lógica de obras, capítulos y comentarios; purga física como operación administrativa posterior con política de retención.

## Estado local al iniciar esta etapa

- `package.json`: Express, TypeScript, Prisma/PostgreSQL, Mongoose, Joi, Multer y Vercel Blob ya declarados.
- `tsconfig.json`: modo estricto, NodeNext y salida `dist`.
- `prisma/schema.prisma`: únicamente `Example` con identificador entero; no hay modelos de dominio definidos en ese archivo.
- `prisma.config.ts`: conexión mediante `DATABASE_URL`, migraciones en `prisma/migrations`, cliente generado en `src/generated/prisma`.
- `src/config/database/postgres.ts`: cliente Prisma con adaptador PostgreSQL. `mongodb.ts`: conexión Mongoose.
- `src/config/env.ts`: valida ambas conexiones y configuración JWT/Blob mediante Joi.
- `src/app.ts` y `src/index.ts`: `/health` y arranque/conexiones. No hay rutas de dominio registradas.
- Handlers, `AppError`, middleware HTTP y logger existentes deben reutilizarse.
- Scripts disponibles: `build`, `dev`, `start`, `prestart`, `prisma:generate`, `prisma:validate`, `prisma:migrate`, `prisma:studio`. No hay scripts `test` ni `lint`.

La inspección del repositorio no demuestra que las bases conectadas estén vacías. Este documento no implica retirar `Example`, sustituir configuraciones ni modificar código generado.

## Evaluación de TankoBase

Se revisó código fuente, además del README. Es una referencia funcional, no una implementación equivalente al backend local:

- Su [esquema Prisma](https://github.com/ElQuenta/TankoBase/blob/main/prisma/schema.prisma) guarda usuarios con UUID, favoritos y progreso. Las referencias a series y episodios son cadenas, sin FK a entidades PostgreSQL de catálogo.
- [Obras](https://github.com/ElQuenta/TankoBase/blob/main/src/data/works.js), [capítulos](https://github.com/ElQuenta/TankoBase/blob/main/src/data/chapters.js) y [comentarios](https://github.com/ElQuenta/TankoBase/blob/main/src/data/comments.js) usan Mongoose y ObjectId; los comentarios guardan contenido como string.
- El [servicio de obras](https://github.com/ElQuenta/TankoBase/blob/main/src/services/work.service.js) combina filtros y devuelve resultados sin paginación en el método revisado.
- El [servicio de capítulos](https://github.com/ElQuenta/TankoBase/blob/main/src/services/chapter.service.js) contempla `APPEND` y `REPOST`. La inserción intermedia necesita un contrato nuevo. Su método de consulta intenta registrar progreso cuando recibe usuario, comportamiento que aquí se propone separar de consultar el capítulo.
- Las [rutas de obras](https://github.com/ElQuenta/TankoBase/blob/main/src/routes/work.routes.js) permiten crear/editar obras a editores. El [servicio de comentarios](https://github.com/ElQuenta/TankoBase/blob/main/src/services/comment.service.js) permite edición ajena a moderadores. Esos permisos difieren de la propuesta actual.

Se reutilizan ideas funcionales, sin trasladar su separación entre bases ni sus permisos automáticamente. La evaluación fue estática; no se ejecutó TankoBase.

## Distribución entre almacenamientos

| Almacenamiento | Responsabilidad propuesta | Motivo |
| --- | --- | --- |
| PostgreSQL / Prisma | Usuarios, roles, asignaciones, catálogo, capítulos, orden de páginas, referencias multimedia, favoritos, puntuaciones, lecturas, visitas y trabajos de limpieza | Fuente de verdad de identidad, catálogo, biblioteca y actividad; las relaciones locales se protegen con FK y transacciones. |
| MongoDB / Mongoose | Comentarios, respuestas, votos y reportes | Fuente de verdad de la comunidad. Un documento por comentario permite respuestas arbitrariamente profundas sin documentos ni arrays de crecimiento ilimitado. |
| Vercel Blob | Bytes de portadas, banners y páginas | Las bases guardan referencias y metadatos; nunca buffers de imágenes. |

El Markdown se guarda como string en MongoDB. La elección de MongoDB delimita un módulo de comunidad con identidad referenciada desde PostgreSQL; no garantiza menos consultas ni más rendimiento por sí sola. El catálogo y el orden de páginas permanecen en PostgreSQL. No se duplica un comentario autoritativo en ambas bases.

No existen FK ni transacciones distribuidas entre PostgreSQL, MongoDB y Blob. Los futuros Services validarán usuario y destino en PostgreSQL antes de operar sobre la comunidad; también verificarán visibilidad al consultar. El repositorio MongoDB no abrirá conexiones PostgreSQL ni conocerá Express.

## Convenciones de los esquemas

- Cada entidad nueva usa UUID generado por el servidor. En PostgreSQL se usa UUID nativo; MongoDB usa UUID como string canónico validado, incluida su clave `_id`. UUID v4 es suficiente para comenzar. Se conserva `Example` con su identificador entero existente. El UUID no reemplaza la autorización.
- En Prisma: `String @id @default(uuid()) @db.Uuid`; FK: `String @db.Uuid`, con nulabilidad cuando corresponda.
- `?` indica nullable. En PostgreSQL los campos relacionales `...Id` son FK; en MongoDB son referencias verificadas por aplicación, sin FK entre motores.
- Instantes: `TIMESTAMPTZ` en UTC. Fechas de calendario: `DATE`. Zona horaria: identificador IANA.
- Texto libre: `TEXT` en PostgreSQL y `String` en MongoDB, con límites de entrada. `slug` y correo/nombre normalizados tienen unicidad explícita.
- Asociaciones con UUID propio también tienen restricciones únicas compuestas para evitar duplicados.
- Las FK protegen existencia; Services y transacciones verifican permisos, estados publicados y reglas entre registros.
- En tablas mutables se incluyen `createdAt`, `updatedAt`; eventos inmutables usan su instante de ocurrencia/registro. Borrado lógico no aplica indiscriminadamente a todas las tablas.

## Usuarios y autorización — PostgreSQL

| Esquema | Campos principales | Restricciones y comportamiento |
| --- | --- | --- |
| `User` | `id`, `email`, `emailNormalized`, `username`, `usernameNormalized`, `passwordHash`, `role`, `timezone`, `status`, fechas, `deletedAt?` | Correo y nombre normalizados únicos. Roles `BASIC`, `EDITOR`, `ADMIN`. Solo hash de contraseña. Zona inicial propuesta `America/La_Paz`, modificable bajo regla de actividad. |
| `WorkEditorAssignment` | `id`, `workId`, `editorId`, `assignedById`, `assignedAt`, `revokedAt?` | Único `(workId, editorId)`. La revocación desactiva la asignación; una nueva asignación reutiliza la fila y queda auditada. Crear o editar un capítulo requiere rol editor vigente y asignación activa, o rol administrador. |
| `AdminAuditEvent` | `id`, `actorId`, `subjectUserId?`, `workId?`, `action`, `previousRole?`, `newRole?`, `occurredAt` | Registro inmutable de cambios de rol y asignaciones/revocaciones. El rol o asignación y su auditoría se escriben en la misma transacción. |

Una asignación no convierte por sí sola a un usuario básico en editor. Revocar el rol invalida sus facultades editoriales aunque queden asignaciones registradas. El servicio vuelve a comprobar rol/asignación al confirmar una edición, para contemplar revocaciones durante una subida.

Un visitante no tiene fila en `User` ni rol persistido. No se incorpora gestión de nuevos administradores por defecto: asignar editor sí está solicitado; promover administradores requiere una política específica.

| Acción | Visitante | Básico | Editor | Administrador |
| --- | --- | --- | --- | --- |
| Ver catálogo, capítulos y comentarios públicos | Sí | Sí | Sí | Sí |
| Favoritos, historial, calendario, racha y puntuación | No | Sí | Sí | Sí |
| Comentar, responder, votar y reportar | No | Sí | Sí | Sí |
| Editar/borrar comentarios propios | No | Sí | Sí | Sí |
| Borrar comentarios ajenos y resolver reportes | No | No | No | Sí |
| Editar comentarios ajenos | No | No | No | No |
| Crear/editar capítulos | No | No | Solo obras asignadas | Sí |
| Eliminar capítulos | No | No | No | Sí |
| Crear/editar/eliminar obras y asignar editores | No | No | No | Sí |

## Catálogo — PostgreSQL

| Esquema | Campos principales | Restricciones y comportamiento |
| --- | --- | --- |
| `WorkType` | `id`, `name`, `slug` | Nombre/slug únicos. Catálogo: manga, manhwa, manhua, cómic, novela ligera, etc. Ampliarlo no exige cambiar un enum. |
| `Work` | `id`, `title`, `slug`, `synopsis`, `typeId`, `publicationStatus`, `releaseStatus`, `coverAssetId?`, `incapBannerAssetId?`, `createdById`, `updatedById`, fechas, `publishedAt?`, `deletedAt?` | `slug` único. Estado de publicación `DRAFT/PUBLISHED`; estado de la obra `ONGOING/COMPLETED/HIATUS/CANCELLED`. Son conceptos independientes. Portada/banners pueden faltar en borrador; publicar exige los recursos aprobados. |
| `WorkAlternativeTitle` | `id`, `workId`, `title`, `normalizedTitle` | Único `(workId, normalizedTitle)`. Permite buscar títulos alternativos sin otra obra duplicada. |
| `Genre` | `id`, `name`, `slug` | Nombre/slug únicos. |
| `WorkGenre` | `id`, `workId`, `genreId` | Único `(workId, genreId)`; relación muchos a muchos. |

No guardar arrays autoritativos de capítulos o comentarios en `Work`: los capítulos se consultan por FK y los comentarios por destino en MongoDB. El título puede repetirse entre obras distintas; no es su identificador. No se añaden autores, equipos de traducción ni traducciones paralelas sin definir su alcance.

## Capítulos y archivos — PostgreSQL + Blob

| Esquema | Campos principales | Restricciones y comportamiento |
| --- | --- | --- |
| `Chapter` | `id`, `workId`, `number NUMERIC(12,3)`, `title?`, `kind`, `status`, `version`, `createdById`, `updatedById`, fechas, `publishedAt?`, `deletedAt?` | Único `(workId, number)`. `number >= 0`; precisión propuesta: hasta tres decimales. `kind = NORMAL/EXTRA/ANNOUNCEMENT`. `status = DRAFT/PUBLISHED`. `version` permite rechazar ediciones desactualizadas. |
| `ChapterPage` | `id`, `chapterId`, `assetId`, `position INTEGER` | Único `(chapterId, position)`; `position > 0`. Contiene exclusivamente páginas editoriales, sin banners. |
| `MediaAsset` | `id`, `pathname`, `url`, `contentType`, `sizeBytes BIGINT`, `width?`, `height?`, `status`, `createdById`, `createdAt` | `pathname` único, tamaño positivo, MIME verificado. Estado `AVAILABLE/DELETING`: solo se vinculan activos disponibles. El archivo está en Blob. No sobrescribir objetos publicados al editarlos; subir nuevas rutas con UUID. |
| `SiteSettings` | `id`, `key`, `generalBannerAssetId?`, fechas | `key` único; una fila `default` como configuración global. No una copia de banner por capítulo. |
| `UploadBatch` | `id`, `requestedById`, `chapterId?`, `workId?`, `status`, `createdAt`, `expiresAt` | Registra una operación antes de subir. Estados `PENDING/COMMITTED/ABANDONED`. El destino y permisos se verifican antes del upload. |
| `UploadObject` | `id`, `batchId`, `pathname`, `assetId?`, `status` | Ruta prevista única, registrada antes de subir. Permite encontrar objetos de lotes abandonados aunque el proceso caiga antes de guardar `MediaAsset`. |
| `MediaCleanupJob` | `id`, `assetId?`, `pathname`, `status`, `attempts`, `nextAttemptAt`, `lastErrorCode?`, fechas | Limpieza reintentable. Verifica ausencia de referencias y bloquea nuevas vinculaciones mientras elimina. No guarda tokens ni errores con secretos. |

La precisión decimal es una propuesta inicial: se validan entradas con máximo tres decimales y se rechazan excesos, sin redondearlas silenciosamente. `12`, `12.0` y `12.000` representan el mismo número. Se intercambia el decimal como cadena para evitar conversiones flotantes. Volúmenes y varias traducciones del mismo número no están incluidos; requerirían ampliar la clave única.

La unicidad propuesta reserva el número también tras borrar lógicamente el capítulo. Para reponerlo se restaura/edita ese mismo capítulo, conservando UUID y relaciones. Si se prefiere crear otro capítulo con el número eliminado, habrá que cambiar a unicidad parcial para capítulos activos y definir qué sucede con el historial anterior.

Regla solicitada para el total: contar capítulos publicados, no eliminados, cuya numeración sea entera; por ejemplo, `1`, `2`, `3` cuentan y `2.5` no. `kind` describe el contenido, pero no sustituye esa regla. Una renumeración a entero cambia el total sin cambiar UUID, comentarios o historial.

Respuesta del lector:

```text
Work.incapBannerAsset
  -> ChapterPage ordenadas por position
  -> SiteSettings.generalBannerAsset
```

Cada elemento de respuesta identifica su función `INCAP_BANNER`, `PAGE` o `GENERAL_BANNER`. Los banners no suman páginas del capítulo ni episodios. Cambiar un banner afecta lecturas futuras; conservar banners históricos no forma parte del alcance inicial.

Para cargas que caben en una petición limitada, subir primero y cambiar la lista completa de páginas en una transacción es suficiente. No hace falta historial de revisiones para publicar ese cambio atómicamente. Si se admiten ediciones repartidas entre muchas peticiones, se añadirá un manifiesto/revisión borrador; el contenido publicado solo cambiará al completarlo.

## Biblioteca, puntuaciones y actividad — PostgreSQL

| Esquema | Campos principales | Restricciones y comportamiento |
| --- | --- | --- |
| `Favorite` | `id`, `userId`, `workId`, `createdAt` | Único `(userId, workId)`. Añadir repetido es idempotente; quitar elimina la relación. |
| `WorkRating` | `id`, `userId`, `workId`, `scoreHalfStars SMALLINT`, fechas | Único `(userId, workId)`, `CHECK 0 <= scoreHalfStars <= 10`. La API muestra `scoreHalfStars / 2`. |
| `UserChapterRead` | `id`, `userId`, `chapterId`, `isRead`, `firstReadAt`, `lastReadAt`, `updatedAt` | Único `(userId, chapterId)`. Estado actual leído/no leído y primera/última finalización; no una fila por relectura. |
| `ChapterReadEvent` | `id`, `chapterId`, `userId?`, `occurredAt`, `localDate?`, `timezoneAtEvent?`, `idempotencyKey UUID` | Evento inmutable de finalización aceptada. Clave idempotente única. Para registrados: usuario, fecha local y zona obligatorios; para visitantes son nulos. Propuesta: único parcial `(userId, chapterId, localDate)` donde `userId IS NOT NULL`. |
| `WorkVisitEvent` | `id`, `workId`, `occurredAt`, `idempotencyKey UUID` | Visita aceptada a la ficha. Clave idempotente única. No requiere almacenar identidad del visitante ni equivale a leer un capítulo. |

Una obra leída se obtiene de capítulos/actividad del usuario relacionados con esa obra; no se duplica una entidad autoritativa `ReadWork`. “Terminó todos los capítulos publicados” puede calcularse, pero no equivale automáticamente a declarar terminada una obra que sigue en emisión. Guardar posición dentro de un capítulo no está solicitado y queda fuera del modelo inicial.

Puntuación cero es válida. Ausencia de `WorkRating` significa que ese usuario no puntuó; promedio de una obra sin valoraciones = `null`, con cantidad de votos `0`. Las valoraciones individuales tienen pasos de media estrella; el promedio agregado puede tener otra precisión.

### Qué se considera lectura

Propuesta: un evento explícito de finalización del lector, por ejemplo al alcanzar el final o al marcar como leído. Obtener el capítulo o descargar imágenes no lo marca automáticamente. El backend valida capítulo publicado, permisos y una clave de operación; el cliente no puede elegir el instante del evento. Esto registra una finalización reportada, no prueba que una persona leyó cada imagen.

La clave idempotente queda ligada al destino y contexto de la operación: reutilizarla para otro capítulo o usuario produce conflicto, no una confirmación del evento anterior.

Para registrados se acepta una contribución por usuario/capítulo/fecha local. El evento, `UserChapterRead` y cualquier agregado asociado se actualizan en una sola transacción. Una nueva finalización del mismo capítulo en otro día cuenta como relectura, sin duplicar su relación de historial.

Para visitantes, registrar solo capítulo, instante y clave idempotente de una operación de lectura. No guardar cuenta invitada, lista personal, dirección IP cruda, huella del dispositivo ni identificador permanente de navegador. Una misma operación no cuenta dos veces; una nueva sesión/operación puede contar de nuevo. Las lecturas anónimas son una métrica de eventos aceptados, **no lectores únicos verificados**. Limitar frecuencia y emitir claves de operación acotadas al capítulo reduce abuso; idempotencia por sí sola no lo evita.

Esta definición conserva la inclusión de visitantes confirmada por el usuario y la ausencia de historial personal anónimo. Si se busca deduplicar personas anónimas por día o medir lectores únicos, hará falta acordar otra política de identidad temporal y retención.

### Calendario, rachas y estadísticas públicas

- Calendario: capítulos distintos completados por fecha local del usuario. Se calcula desde `ChapterReadEvent` con usuario; el índice único propuesto evita contar repetidos del mismo día.
- Fechas UTC para estadísticas globales; `localDate` y zona IANA al ocurrir para actividad personal. Cambiar la zona no reinterpreta eventos anteriores; limitar cambios de zona evita manipular límites del día.
- Racha actual: días consecutivos con actividad hasta hoy o ayer. Si hoy aún no leyó y ayer sí, la racha sigue vigente. Racha máxima: mayor secuencia de días con actividad.
- Desmarcar leído no borra eventos históricos. Renumerar o sustituir páginas tampoco borra actividad ni comentarios.
- Visitas: `WorkVisitEvent` de la obra. Lecturas: `ChapterReadEvent` unido a capítulos de la obra, incluidos los anónimos.
- Últimas 24 horas: ventana móvil sobre `occurredAt`, no suma de hoy y ayer ni un único día calendario.
- Desde siempre: cantidad de eventos aceptados desde el inicio de medición. No es una estimación de visitas anteriores a instrumentar el sistema.
- Favoritos: número de relaciones `Favorite`. Promedio y votos: `WorkRating`. Total de episodios enteros: consulta sobre `Chapter` según su regla.

Al inicio se consultan las fuentes originales. `UserDailyActivity`, `WorkStats` o agregados horarios se incorporarán solo si hacen falta por rendimiento, como proyecciones reconstruibles, nunca como segunda fuente de verdad. No borrar eventos necesarios para totales o calendario sin diseñar previamente su archivado/agregación y la política de conservación.

## Comentarios y moderación — MongoDB

| Esquema | Campos principales | Restricciones y comportamiento |
| --- | --- | --- |
| `Comment` / `comments` | `_id`, `authorId`, `targetType WORK/CHAPTER`, `targetId`, `parentCommentId?`, `rootCommentId`, `bodyMarkdown String?`, `status ACTIVE/DELETED`, `revision`, `createdAt`, `updatedAt`, `editedAt?`, `deletedAt?`, `deletedById?` | UUID string en identificadores. Destino obligatorio e inmutable. La raíz apunta a su propio UUID, tiene padre nulo; una respuesta hereda destino y raíz del padre. Cuerpo requerido y no vacío en comentarios activos. `revision` participa en la serialización de operaciones concurrentes. |
| `CommentVote` / `commentVotes` | `_id`, `commentId`, `userId`, `value`, fechas | Único `(commentId, userId)`, valor `-1` o `1`. Cambiar signo sustituye el voto; retirarlo elimina el documento. |
| `CommentReport` / `commentReports` | `_id`, `commentId`, `reporterId`, `reason`, `details?`, `status`, `createdAt`, `updatedAt`, `reviewedAt?`, `reviewedById?`, `resolution?` | Único `(commentId, reporterId)` como decisión inicial. Estado `OPEN/IN_REVIEW/RESOLVED/DISMISSED`. Solo administrador resuelve. |

No se crea colección `CommentThread`: `targetType` y `targetId` identifican la conversación. No guardar arrays de respuestas ni de ancestros en cada comentario. `parentCommentId` representa la respuesta directa y `rootCommentId` permite consultar una rama sin recorrer sus padres. Puede responder al suyo. Padre, raíz y destino no cambian tras crear el comentario; el padre debe existir y estar activo al responder. El repositorio deriva destino y raíz del padre validado, sin aceptar su cambio desde una actualización genérica. Crear siempre un UUID nuevo e impedir reparentar evita ciclos por las operaciones expuestas.

Paginación por cursor `(createdAt, _id)`, orden ascendente estable: listado de principales por destino y padre nulo; listado de respuestas directas por padre; listado de rama por raíz. Límites acotados por consulta; nunca devolver automáticamente todo el árbol. Puede existir profundidad lógica arbitraria sin recursión de documentos. El diseño de UI y un eventual límite de profundidad de producto son decisiones futuras.

Solo el autor edita; autor o administrador eliminan. Al borrar, conservar un marcador y las respuestas; `bodyMarkdown` se elimina del registro público y queda nulo en la propuesta inicial. No permitir nuevos votos/respuestas a un comentario eliminado. Si los reportes necesitan preservar evidencia del texto previo, acordar una copia restringida con retención explícita antes de incorporarla.

Guardar Markdown original como texto, con dialecto documentado: por ejemplo negrita, cursiva, citas, código y `||spoiler||`. El renderer debe tratar HTML arbitrario como texto o eliminarlo y restringir enlaces. El formato spoiler no requiere un esquema separado. No se añaden adjuntos a comentarios en esta etapa.

Contadores de votos se calculan desde `CommentVote`. Un reporte no elimina automáticamente un comentario. Prohibir autovotos o permitir reportes repetidos tras cambios sustanciales son decisiones adicionales, no requisitos confirmados.

### Consistencia del módulo de comunidad

MongoDB es necesario para consultar o modificar comentarios, votos y reportes. Su indisponibilidad debe producir un error controlado de comunidad, sin sustituir silenciosamente sus datos ni crear otra fuente de verdad en PostgreSQL. El catálogo, la biblioteca y las estadísticas de lectura permanecen en PostgreSQL.

No se usa `populate` hacia usuarios PostgreSQL. El futuro Service recuperará perfiles de autores mediante una consulta por lote y devolverá solo campos públicos. Las bajas lógicas de obras, capítulos o cuentas no borran automáticamente documentos MongoDB: las lecturas públicas comprueban que el destino siga publicado; cualquier purga posterior necesita política y reconciliación explícitas.

La creación de respuestas, votos y reportes se ejecuta en transacción MongoDB y realiza una escritura condicional sobre el comentario `ACTIVE` incrementando `revision`, además de insertar/actualizar la interacción. El borrado lógico compite sobre el mismo documento. Así se evita aceptar una interacción después de validar un estado que otro proceso ya eliminó. Si la interacción se confirmó primero, el borrado posterior conserva las respuestas existentes. Una lectura previa seguida de una inserción sin esa escritura compartida no garantiza esta regla.

Este contrato requiere MongoDB replica set o clúster compatible con transacciones; un servidor standalone no basta. No se incorpora un fallback que omita la transacción. La transacción solo cubre MongoDB: el estado SQL del usuario/destino se comprueba desde el futuro Service y no queda incluido en ella.

Votos únicos son la fuente de verdad del conteo. No se guardan contadores duplicados que necesiten una transacción adicional. Retirar un voto es idempotente; el índice único evita votos duplicados bajo concurrencia. Reportes permanecen restringidos a moderación y no se incluyen en consultas públicas.

Telemetría técnica con payload variable queda fuera de esta implementación; no se crea colección `TelemetryEvent`.

## Índices, integridad y eliminaciones

Índices iniciales además de PK y únicos:

- `Work(typeId, publicationStatus, publishedAt, id)` y `WorkGenre(genreId, workId)`.
- `WorkEditorAssignment(editorId, revokedAt, workId)`.
- `Chapter(workId, status, number)` y único de páginas por capítulo/posición.
- `Favorite(userId, createdAt, id)` y `Favorite(workId)`.
- `WorkRating(workId)`; el único por usuario/obra cubre consultas personales.
- `UserChapterRead(userId, lastReadAt, id)`.
- `ChapterReadEvent(chapterId, occurredAt)`, `(userId, localDate)`, `(occurredAt)`.
- `WorkVisitEvent(workId, occurredAt)`.
- MongoDB `Comment(targetType, targetId, parentCommentId, createdAt, _id)`, `Comment(parentCommentId, createdAt, _id)` y `Comment(rootCommentId, createdAt, _id)`.
- MongoDB `CommentVote(commentId, userId)` único y `CommentReport(commentId, reporterId)` único; reportes por `(status, createdAt, _id)`.
- `MediaCleanupJob(status, nextAttemptAt)` y `UploadBatch(status, expiresAt)`.

La búsqueda parcial por título requiere evaluar una estrategia textual; un índice B-tree simple no garantiza acelerar `contains`. Comenzar con consultas parametrizadas e insensibles a mayúsculas sobre título/títulos alternativos; evaluar índices de texto o trigramas con datos reales. No introducir un buscador externo en esta etapa.

Los `CHECK`, FK compuestas, índices parciales y restricciones diferibles que Prisma no represente directamente deben quedar en migraciones SQL revisadas. Reordenar páginas debe respetar la unicidad durante toda la transacción, mediante restricción diferible o posiciones temporales controladas. No confiar solo en validación de aplicación para unicidad bajo concurrencia.

La eliminación lógica de una obra debe ocultar también sus capítulos y comentarios en todas las rutas públicas; consultas directas deben verificar el estado de sus antecesores. Esa coordinación entre PostgreSQL y MongoDB corresponde a Services futuros, no a una FK. No borrar en cascada eventos, reportes o archivos indiscriminadamente. Las FK a medios restringen eliminación mientras existan referencias. Purga de cuentas, anonimización y retención de auditorías requieren definir una política específica antes de implementar eliminación definitiva.

## Contratos API orientativos

Son contratos para la implementación futura, no endpoints existentes:

- Catálogo: `GET /api/works?q=...&genre=accion&genre=fantasia&type=manhwa&status=ONGOING&page=1&pageSize=20&sort=updatedAt_desc`.
- Filtros de categorías distintas se combinan con AND. Propuesta: varios géneros también requieren todos; cambiar a coincidencia de cualquiera debe ser una opción explícita.
- Paginación con `page >= 1`, `1 <= pageSize <= 100`; respuesta `items`, `page`, `pageSize`, `total`, `totalPages`. Orden estable con UUID como desempate; lista acotada de campos para ordenar. No devolver todas las páginas de todos los capítulos en el catálogo.
- `GET /api/chapters/:id`: metadatos y secuencia banner/páginas/banner; consultar no marca leído.
- `POST /api/chapters/:id/read-events`: finalización, autenticación opcional, clave idempotente. Registrado: guarda evento y progreso; visitante: solo evento estadístico mínimo. Se mantiene un único contrato de conteo.
- `PUT /api/me/read-chapters/:id` y `DELETE /api/me/read-chapters/:id`: marcar/desmarcar leído para registrado; marcar utiliza el mismo servicio y deduplicación de finalización, sin doble conteo.
- `PUT/DELETE /api/me/favorites/:workId` y `PUT/DELETE /api/works/:id/rating`: relación única por usuario/destino.
- `POST/DELETE /api/admin/works/:id/editors/:userId`: asignar/revocar editor, con auditoría.
- Edición de capítulos: operaciones explícitas para reemplazar, insertar y anexar páginas, con `expectedVersion`; conflicto si cambió la versión.
- Comentarios, respuestas, votos y reportes usan UUID; autor/rol se obtienen de autenticación, nunca de un `userId` confiado del body.

Errores a definir con los handlers existentes: entrada inválida, no autenticado, sin permiso, no encontrado, conflicto de número/versión y límites de upload. Aplicar listas permitidas a filtros/orden; nunca construir SQL desde texto libre recibido.

## Pipeline y recuperación multimedia

Orden obligatorio: autenticación -> autorización y verificación del destino/asignación -> Multer con límites -> validación de firma/tamaño/cantidad/tipo/contenido -> middleware Blob -> controller -> service -> repository.

El middleware devuelve metadatos tipados en `res.locals.uploadedMedia`: `url`, `pathname`, `contentType`, `size`, y dimensiones cuando se verifiquen. Credenciales de Blob nunca forman parte de esa respuesta.

1. Registrar lote y rutas previstas antes de los efectos externos; usar nombres saneados y UUID.
2. Subir todos los archivos nuevos. Si un upload falla, compensar los ya subidos y dejar limpieza reintentable.
3. Revalidar rol/asignación y versión dentro de la operación de persistencia. Una revocación y una edición concurrentes deben serializar sus comprobaciones sobre usuario/asignación; para conflictos de versión usar actualización condicional.
4. Una transacción PostgreSQL cambia referencias, orden, número/estado y versión; marca el lote confirmado y programa limpieza de reemplazados.
5. Si falla, conservar contenido publicado anterior y limpiar nuevos objetos. Un reconciliador procesa lotes vencidos o caídas entre upload y commit.
6. El worker de limpieza vuelve a comprobar referencias. Antes de borrar un objeto, la aplicación impide que una nueva vinculación use un activo en eliminación; no basta comprobar y borrar sin coordinación.

Confirmar y abandonar compiten mediante transición condicional/bloqueo del mismo lote: `PENDING -> COMMITTED` frente a `PENDING -> ABANDONED`. Solo confirma un lote pendiente y vigente; un lote reclamado para limpieza ya no puede confirmar. La reconciliación contempla uploads tardíos de lotes abandonados para que una subida finalizada después del primer intento de limpieza no deje objetos permanentes sin referencias.

No existe transacción distribuida PostgreSQL–Blob. URLs públicas no garantizan privacidad de borradores. Para confidencialidad se necesita almacenamiento/acceso privado. Los límites concretos de tamaño, dimensiones, formatos y páginas se fijarán antes de implementar Multer; para capítulos grandes evaluar subida directa/streaming con autorización equivalente, sin memoryStorage ilimitado.

## Secuencia de implementación futura

La etapa autorizada de esquemas y repositorios se detalla en [PERSISTENCIA_INICIAL.md](PERSISTENCIA_INICIAL.md). La siguiente secuencia describe el producto completo; no implica que esta entrega implemente endpoints o workers:

| Paso | Responsable y archivos/módulos propios | Dependencias y aceptación |
| --- | --- | --- |
| 1 | DB: `prisma/schema.prisma` y migraciones revisables. Dev: modelos y repositorios de comunidad MongoDB | Contratos acordados, UUID, FK SQL e índices Mongo; conservar `Example`, sin reset ni migraciones remotas automáticas. |
| 2 | Dev: módulos auth/usuarios/asignaciones | Consumir contratos DB; permisos por rol y obra; sin editar schema. |
| 3 | Media: middleware y utilidades de uploads/compensación | Contrato de metadatos y lotes; publicación conserva contenido anterior ante fallos. |
| 4 | Dev: catálogo/capítulos y composición de lectura | Depende de permisos, persistencia y uploads; orden estable y edición concurrente protegida. |
| 5 | Dev: biblioteca, actividad y comunidad | Unicidad e idempotencia; historial y calendario coherentes. |
| 6 | Test y Reviewer: verificaciones y revisión independiente | Integridad, permisos, concurrencia, fallos y exposición de datos. |

Separar implementadores en ramas/worktrees independientes según WORKFLOW.md; acordar propiedad de archivos antes de editar. Nadie integra en QA sin aprobación humana.

## Criterios de aceptación y validación

- Un editor asignado crea/edita capítulos; uno sin asignación, revocado o sin rol vigente no puede. Ningún editor elimina capítulos ni altera obras.
- Renumerar `12.5` a `13` conserva UUID, votos/comentarios y lecturas, y actualiza el conteo de enteros.
- Reemplazar/insertar/anexar páginas conserva un orden único; fallos no publican una lista incompleta. Versiones concurrentes producen conflicto.
- Banners aparecen una sola vez en sus extremos, sin contarse como páginas editoriales.
- Un voto por comentario y usuario; un favorito y puntuación por usuario/obra, incluso con solicitudes simultáneas.
- Responder a un comentario de otro destino o crear ciclos se rechaza. Borrar padre conserva respuestas y oculta su cuerpo. Los listados están acotados y paginados por cursor estable.
- Una obra sin votos se diferencia de una valoración promedio cero.
- Reintentos de una misma lectura no duplican eventos. Registrados no duplican contribución del capítulo en el mismo día.
- Visitantes contribuyen a métricas sin `User`, favoritos, historial ni calendario personal persistente.
- Ventana móvil de 24 horas y calendario local producen resultados distintos y correctos cerca de medianoche; racha y cambios de zona tienen pruebas específicas.
- Comentarios, votos y reportes tienen una sola fuente de verdad en MongoDB; no existen tablas Prisma equivalentes ni arrays de respuestas crecientes.
- Caídas después de subir, antes/después del commit y durante limpieza se recuperan con lotes/trabajos; no se eliminan activos referenciados.
- Filtros combinados y paginación estable respetan límites y excluyen contenido no publicado/eliminado.

Los criterios anteriores describen la aceptación del producto completo, incluidas etapas futuras. Los criterios y resultados de la base de persistencia se registran por separado en [PERSISTENCIA_INICIAL.md](PERSISTENCIA_INICIAL.md). La evaluación de TankoBase fue estática; no se ejecutó su aplicación. No afirmar conexiones, migraciones desplegadas o funcionalidades HTTP probadas sin evidencia.

## Riesgos y pendientes

- Ratificar semántica de lectura/relectura, calendario/racha para todos los registrados, banners y eliminación lógica.
- Definir límites multimedia y políticas de conservación de eventos, cuentas y evidencia de moderación.
- La deduplicación anónima propuesta evita reintentos de una operación, no identifica personas ni impide toda inflación de métricas.
- Las conexiones locales registran URI completas en debug; crear una tarea posterior para evitar exponer credenciales. No se cambiaron en este trabajo.
- Revisar tablas/datos reales antes de diseñar migraciones definitivas; no retirar `Example` automáticamente.
- No hay integridad referencial entre motores: controlar existencia y visibilidad desde Services y definir reconciliación antes de permitir purgas físicas.
- Índices únicos MongoDB requieren creación efectiva en el despliegue; declararlos en Mongoose no prueba que existan en una base remota.

Rama de trabajo de la etapa actual: `feature/persistence-schemas-community`. Este documento registra la propuesta; el plan asociado registra alcance, verificaciones y límites de la implementación. No implica despliegue ni integración a QA.
