# Feature: Obras, capítulos y archivos multimedia

## Objetivo

Permitir crear, consultar, editar, publicar y retirar obras y capítulos. Gestionar portada e imagen inicial individuales y páginas múltiples mediante Multer y Vercel Blob, preservando orden, concurrencia y recuperación de fallos.

## Estado actual

Inspección: AGENTS.md, skill modofriki-features, rol planner, docs/agents/WORKFLOW.md, package.json, tsconfig.json, prisma.config.ts, prisma/schema.prisma y migración core_domain; src/config/database/*, src/config/env.ts, src/app.ts, src/index.ts, rutas y controller community, middlewares auth/role/validación, handlers, tipos Express y logger.

Existen auth y comunidad; no existen endpoints de gestión de obras/capítulos ni implementación de upload. PostgreSQL ya contiene Work, WorkType, Genre, títulos alternativos, Chapter, ChapterPage, MediaAsset, UploadBatch, UploadObject y MediaCleanupJob. MongoDB almacena comunidad. El repositorio community/catalog.repository.ts consulta destinos publicados y debe conservarse compatible.

TypeScript usa strict y genera dist con tsc. Scripts existentes: build, dev, start, prestart, prisma:generate, prisma:validate, prisma:migrate y prisma:studio. No hay scripts test/lint ni directorio tests al inspeccionar. Prisma genera src/generated/prisma; no editarlo manualmente. Ya están instalados Joi, Multer y @vercel/blob.

## Alcance

CRUD de obras y capítulos; listados/detalles públicos únicamente publicados y no eliminados; catálogos mínimos WorkType y Genre; arrays simples de géneros y títulos alternativos. Autenticación existente para escrituras y atribución obligatoria createdBy/updatedBy. ADMIN administra todo; EDITOR modifica obras asignadas vigentes y sus capítulos. Crear obras y crear catálogos requiere ADMIN.

Fuera: favoritos, puntuaciones, historial de lectura, visitas, nuevos vínculos al usuario, administración de asignaciones y nuevos modelos Mongo. La imagen inpagecover se corresponde inicialmente con Work.incapBannerAsset y se devuelve como imagen inicial para sus capítulos; si se requiere imagen distinta por capítulo hará falta revisar contrato y persistencia antes de implementar ese cambio.

Las ediciones PUT admiten JSON de metadatos sin archivos y multipart con archivos opcionales. La ausencia de un archivo preserva su referencia existente. No se fuerza reenvío de portada, imagen inicial ni páginas al editar metadatos.

## API

Prefijo /api. Todas las respuestas reutilizan { success, code, data }; 201 creación, 200 consulta/actualización, 204 retirada. Los nombres concretos de tipos/métodos se ajustan conjuntamente entre DB, Media y coordinador antes de implementación.

| Método y ruta | Entrada | Acceso / salida |
| --- | --- | --- |
| GET /works | page, limit acotado, búsqueda y filtros typeId/genreId | Público; lista paginada publicada |
| POST /works | title, synopsis, typeId; publicationStatus/releaseStatus, alternativeTitles[], genreIds[] opcionales; multipart cover e inpagecover individuales | ADMIN; obra creada |
| GET /works/:workId | UUID | Público; obra publicada, medios y catálogos |
| PUT /works/:workId | Campos editables parciales, expectedUpdatedAt; JSON o multipart con cover/inpagecover opcionales | ADMIN o EDITOR asignado; obra actualizada |
| DELETE /works/:workId | Control de concurrencia acordado | ADMIN o EDITOR asignado; baja lógica y limpieza |
| GET /works/:workId/chapters | Paginación | Público; capítulos publicados de obra publicada |
| POST /works/:workId/chapters | number decimal como texto, title?, kind?, status?; pages[] multipart | ADMIN o EDITOR asignado; capítulo y páginas |
| GET /works/:workId/chapters/:chapterId | UUID | Público; capítulo publicado y páginas ordenadas |
| PUT /works/:workId/chapters/:chapterId | expectedVersion, number/title/kind/status opcionales; JSON sin archivos o multipart con pages opcionales | ADMIN o EDITOR asignado; metadatos; páginas adjuntas reemplazan conjunto |
| DELETE /works/:workId/chapters/:chapterId | expectedVersion | ADMIN o EDITOR asignado; baja lógica y limpieza |
| PUT /works/:workId/chapters/:chapterId/pages | expectedVersion y pages[] | Reemplazo completo de páginas |
| POST /works/:workId/chapters/:chapterId/pages | expectedVersion, position y pages[] | Inserción desde posición 1-based, desplazando existentes |
| PATCH /works/:workId/chapters/:chapterId/pages | JSON expectedVersion, pageIds[] | Permutación exacta de páginas del capítulo |
| GET /work-types, GET /genres | Sin cuerpo | Público; catálogos disponibles |
| POST /work-types, POST /genres | name, slug | ADMIN; entrada creada |

Validar UUID completos, enum del schema, referencias existentes, títulos no vacíos, límites de strings/arrays, decimal no negativo con máximo tres decimales y orden/paginación determinista. Rechazar IDs, rutas y metadatos Blob suministrados como autoridad por el cliente. Publicar capítulo requiere obra disponible y páginas válidas. Obra publicada debe satisfacer las invariantes de portada acordadas; DRAFT permite reserva incompleta para journaling.

Errores: 400 entrada o contenido de imagen inválido/MIME discordante, 401 sesión ausente/inválida, 403 permisos, 404 recurso inexistente/no visible, 409 duplicado/versión obsoleta/colisión, 413 límites de carga, 415 formato de imagen persistida no reutilizable, 503 Blob no configurado y 500 fallo inesperado del proveedor con mensaje seguro. No exponer borradores ni detalles internos mediante consultas públicas.

## Pipeline de middlewares

Routes usan Router.route y .all para validaciones comunes; no poner autenticación común en rutas que comparten GET público y escrituras protegidas. .all puede validar params; auth y autorización van en cada escritura o .all de endpoints exclusivamente privados.

1. Autenticación existente y rol desde estado vigente.
2. Validación de params y autorización previa del recurso mediante Service; existencia, asignación, estado y snapshot de versión. No recibir archivos para solicitudes no autorizadas.
3. Multer únicamente cuando Content-Type es multipart; JSON metadata-only continúa sin exigir archivos.
4. Joi sobre metadatos multipart ya parseados, validación de cantidad/tamaño/tipo y firma real del contenido. No confiar en MIME/nombre original.
5. Reserva DRAFT/journal si es creación; middleware Blob sube o copia archivos de renumeración; entrega metadatos tipados en res.locals.uploadedMedia.
6. Controller extrae body/params/locals y llama Service, sin Prisma/Mongoose.
7. Service verifica invariantes y solicita commit a Repository. No invoca Blob.
8. Repository realiza transacción corta con control de versión, assets, referencias, journal y trabajos de limpieza.
9. Middleware/finalización de media compensa uploads no vinculados y procesa limpieza posterior al commit. Fallos deben llegar al error handler existente.

Límites explícitos propuestos para revisión Media: JPEG/PNG/WebP, 10 MiB por imagen, máximo 100 páginas por solicitud y límite total de 100 MiB; cover/inpagecover máximo uno por campo. Preferir almacenamiento temporal con cleanup al finalizar/abortar y concurrencia Blob acotada para evitar memoryStorage acumulando lotes. Si se usan buffers, limitar también total y concurrencia de peticiones. No admitir SVG ni nombres/pathnames arbitrarios. El límite final debe quedar documentado y probado.

Usar try/catch, createLogger y catchAndLogError en las capas nuevas siguiendo auth/community; logs estáticos sin tokens, contenidos ni errores de proveedor con secretos.

## Persistencia

Fuente de verdad: PostgreSQL/Prisma. MongoDB/Mongoose: sin cambios. Blob: bytes; PostgreSQL solo referencias y metadatos. No se proponen migraciones ni dependencias nuevas.

Work conserva slug estable generado al crear: slug(title)-uuid4, con reserva única y reintentos acotados. Editar title no mueve la carpeta. Las barras de Blob son '/', no separadores Windows. Estructura:

```text
<work.slug>/Covers/<uuid4>.<ext>
<work.slug>/CoverPage/<uuid4>.<ext>
<work.slug>/Chapter-<chapterUuid4>/<uuid4>-<position>.<ext>
```

uuid4 significa abreviación de cuatro caracteres de un UUID completo generado por servidor, no UUID v4 completo. Las abreviaciones no identifican registros ni autorizan acceso. Detectar colisiones de carpeta de capítulos dentro de la obra y de pathname, reservar antes de escribir, no sobrescribir objetos existentes. Si colisiona abreviación fija de capítulo, regenerar su UUID antes de reservarlo. Cada nueva revisión de una página recibe prefijo aleatorio nuevo, conservando sufijo de posición; evita sobrescribir páginas aún visibles durante inserciones/reordenamientos. No usar addRandomSuffix si rompe el formato solicitado.

Chapter.version protege toda mutación de metadatos/páginas. Comparación e incremento deben estar en la misma transacción; perdedor devuelve 409 y limpia su lote. Work usa expectedUpdatedAt con comparación atómica o bloqueo equivalente, sin columna nueva. Revalidar permisos vigentes al confirmar, porque pueden cambiar durante la subida.

ChapterPage.position tiene unique(chapterId, position) y CHECK positivo: no utilizar posiciones temporales negativas. Reconstruir filas con IDs preservados cuando corresponda dentro de transacción, o desplazamiento positivo seguro, sin exponer estados parciales. Número de capítulo mantiene unique(workId, number), incluso si hay baja lógica; documentar 409 al intentar reutilizarlo.

UploadBatch exige exactamente un destino no nulo mediante CHECK SQL y FK existente. Para crear obra/capítulo hay que reservar previamente registro oculto mediante deletedAt sentinel y su lote; no inventar lote sin destino ni FK futura. Finalizar/publicar y quitar el sentinel solo después de que todos los objetos estén disponibles. Si falla, abandonar lote y retirar reserva. Las consultas públicas nunca muestran reservas; los borradores fallidos deben poder limpiarse/reintentarse sin bloquear slugs/números indefinidamente.

Plan de recuperación: registrar UploadObject PLANNED antes del efecto externo; marcar UPLOADED tras éxito; transacción de dominio pasa objetos a LINKED y batch a COMMITTED. Reemplazos/retirada desvinculan referencias y crean MediaCleanupJob en esa misma transacción. Nunca borrar anteriores antes del commit. Ante fallo, batch ABANDONED y limpieza idempotente de nuevos objetos. Un reconciliador de lotes PENDING vencidos cubre caídas entre Blob y DB, incluidos objetos PLANNED cuyo upload pudo completarse. Antes de borrar un asset comprobar que ninguna referencia viva lo usa; DELETING impide volver a vincularlo. Jobs fallidos mantienen intento/fecha/error seguro para reintento acotado.

Inserción/reordenamiento: construir snapshot final; copiar a nuevos pathnames las páginas cuyo número cambia, además de nuevas páginas; mantener conjunto anterior intacto hasta commit. No hay transacción distribuida. Por baja lógica de obra/capítulo, conservar registros de auditoría y relaciones restrictivas; retirar referencias multimedia y encolar limpieza según retención acordada.

## Contratos compartidos

Archivo propuesto propietario DB: src/types/catalog.types.ts.

- Actor: { id, role }, reutilizando AuthUser existente.
- WorkInput: title, synopsis, typeId, publicationStatus?, releaseStatus?, alternativeTitles?: string[], genreIds?: string[].
- ChapterInput: number decimal string, title?, kind?, status?.
- UploadedMedia/AssetInput: id UUID completo, pathname, url, contentType, sizeBytes o size numérico seguro, width?, height?; DB convierte a BigInt. DTO JSON convierte BigInt a texto/número seguro y Decimal a string.
- WorkMedia: cover? e inpagecover?; ausencia significa preservar.
- PageMutation: mode replace/insert/reorder, expectedVersion, position?, pageIds?, assets resultantes y journal batchId.
- res.locals.uploadedMedia: colección tipada y batchId con contexto/snapshot de recurso; nunca cuerpos proporcionados directamente por cliente.
- Servicios/repositorios retornan DTO o snapshot persistido; no dependen de Request/Response. Middleware media consume preflight del servicio, no consultas duplicadas en rutas/controllers.

Propuesta inicial anterior a la congelación de contratos, sustituida por WorkRepositoryContract y ChapterRepositoryContract: listWorks, getWork, createWork, updateWork, deleteWork, listChapters, getChapter, createChapter, updateChapter, deleteChapter, mutatePages, canEditWork, listWorkTypes/createWorkType, listGenres/createGenre. DB y Dev acuerdan firmas definitivas antes de editar consumidores. Create/commit reciben Actor, medios verificados y batchId. Operaciones preflight devuelven snapshots mínimos para reservar rutas y verificar versión.

MediaRepository: beginBatch, planObjects, markUploaded, abandonBatch, enqueueCleanup, listDueCleanup, markCleanupComplete, markCleanupFailed y reconciliación de vencidos. El commit de dominio enlaza los objetos en su propia transacción; Media no confirma por separado referencias de dominio.

## Tareas

### TASK-01 — Contratos y persistencia

Responsable: DB. Objetivo: repositorios transaccionales, journaling y DTO compartidos.
Archivos propios: src/types/catalog.types.ts, src/repositories/catalog/*, src/repositories/media/*; schema/migraciones solo si revisión evidencia necesidad y con coordinación previa.
Dependencias: contrato consensuado con Media/Dev; ninguna implementación de Blob.
Contrato: métodos/snapshots descritos arriba; devuelve 404/409 operacionales, no errores de driver.
Validaciones/tests: restricciones reales, concurrencia, refs de catálogo, rollback, FK de lote y registro de cleanup.
Criterios: ninguna pérdida de actualización; ninguna referencia a objetos inexistentes; borradores reservados permanecen privados; no duplicar autoridad en Mongo.

### TASK-02 — Pipeline multimedia

Responsable: Media. Objetivo: recepción individual/múltiple, contenido, rutas, subida/copia y compensación.
Archivos propios: src/middlewares/media/*, src/types/media.types.ts y utilidades de media nuevas; ampliación de Express solo en archivo propio para evitar conflicto con tipos auth.
Dependencias: TASK-01 tipos de journal y snapshots. No editar rutas/controllers de Dev.
Contrato: middleware factories inyectables, res.locals.uploadedMedia tipado, JSON sin archivos pasa; Blob exclusivamente en middleware/infraestructura media.
Validaciones/tests: firmas, límites, colisiones, nombre hostil, fallo parcial, desconexión, copia/renumeración, no sobrescritura y limpieza reintentable.
Criterios: los nombres cumplen formato; rechazos de validación no producen uploads; error postupload conserva anteriores y encola limpieza de nuevos.

### TASK-03 — API y negocio

Responsable: Dev/coordinador. Objetivo: controladores, servicios, preflight, schemas y rutas.
Archivos propios: src/routes/catalog.routes.ts, src/controllers/catalog/*, src/services/catalog/*, src/middlewares/schemas/catalog.schema.ts; src/app.ts y openapi.yaml con un único propietario coordinador.
Dependencias: contratos TASK-01/02 congelados.
Contrato: API anterior, Router.route/.all, Joi, handlers existentes, try/catch y catchAndLogError.
Validaciones/tests: autorización previa y final, visibilidad pública, creación/cambio de estado, metadata-only, arrays y decimales.
Criterios: Controllers sin consultas; Services sin Express/Blob; medios omitidos se conservan; PATCH de orden no recibe binarios.

### TASK-04 — Pruebas y revisión

Responsable: Test/coordinador; Reviewer y Security revisan en solo lectura.
Archivos propios: scripts de verificación/pruebas nuevos bajo convención acordada; sin nuevas dependencias de test ni scripts npm inventados. Coordinador actualiza este plan con resultados reales.
Dependencias: implementación combinada TASK-01/02/03.
Contrato: fakes de Prisma/Blob/auth cuando no hay servicios de prueba; documentar diferencia frente a integración real.
Validaciones: build, prisma:validate cuando corresponda sin migrar; ejecución explícita con node:test/tsx disponible si se crean suites; revisión de secretos/recursos/permisos.
Criterios: evidencia real de pruebas positivas/negativas y fallos postupload; ninguna afirmación de integración externa sin ejecutarla.

## Plan de pruebas

Unitarias: slug seguro/estable, orden final, permutaciones, decimal, DTO BigInt, control de versiones y JPG/PNG/WebP por firma.

Integración: crear obra con portada/imagen inicial; editar una sola imagen; editar JSON sin imágenes; crear capítulo con varias páginas; reemplazar y comprobar desvinculación/cleanup; insertar en inicio/medio/final y renumerar archivos afectados; ordenar sin perder imágenes; dos escritores del mismo expectedVersion (uno confirma, otro 409); colisión abreviada y pathname existente sin sobrescritura.

Autorización: anónimo/BASIC/EDITOR no asignado rechazados antes de Multer/Blob; EDITOR asignado permitido; revocación durante upload bloquea commit; capítulos de obra oculta no son públicos.

Casos negativos: UUID inválido, catálogo inexistente, página duplicada/ajena/omitida en permutación, archivos vacíos o firmas falsas, exceso por campo/total, multipart desconocido, publicación vacía, fallo parcial Blob, fallo DB, fallo de borrado y caída después de upload antes de journal actualizado. El reconciliador no borra objetos LINKED ni de lotes COMMITTED.

Regresiones: auth/community y rutas /health y /api/docs; no cambios de .env, credenciales ni código generado. Comprobar que consultas públicas no escriben eventos/lecturas.

## Riesgos

- Cuatro caracteres tienen alto riesgo de colisión: reservas y reintentos sin sobrescribir; no equivalen a identidad global.
- Public Blob con URLs anteriores puede servir bytes hasta cleanup; baja lógica no es revocación inmediata de caché externa.
- Copiar páginas por renumeración implica tráfico/costo proporcional al sufijo desplazado; limitar lote y concurrencia.
- Journal exige destino previo y complica creación: reservas DRAFT y recuperación obligatorias.
- No hay infraestructura automatizada de test declarada; no confundir build con pruebas ni verificar proveedores usando producción.
- La asignación por obra se reutiliza para seguridad, sin implementar módulos de vínculo nuevos. Confirmar si una futura imagen inicial por capítulo justifica ampliar schema.
- Los límites exactos de carga y estrategia de ejecución de cleanup deben quedar fijados en entrega; no dejar jobs sin mecanismo operativo de reintento.

## Integración

Rama feature: feature/works-chapters-media. DB y Planner trabajan en el directorio raíz con archivos disjuntos. API y Media implementan en worktrees aislados coordinados por el agente principal; no integran por su cuenta.

Build inicial aprobado por el coordinador; tests iniciales N/D (suite aún inexistente). Build final y validación Prisma aprobados. Pruebas finales y revisión se registran en la entrega verificada al final. Aprobación QA: no solicitada ni concedida; requiere aprobación humana antes de integrar.

## Criterios de aceptación

1. Consultas públicas solo devuelven obras/capítulos publicados vigentes y páginas con orden 1..N.
2. Escrituras respetan auth/roles/asignaciones y no introducen funcionalidades personales del usuario.
3. PUT JSON edita metadatos conservando todos los medios; multipart permite reemplazar únicamente los adjuntos presentes.
4. Cover/inpagecover son archivos individuales; páginas admiten uno o múltiples archivos, reemplazo, inserción y reordenamiento.
5. Pathnames seguros, carpeta de obra estable, UUID abreviado de cuatro caracteres y numeración final correcta sin sobrescrituras.
6. Fallos de Blob/DB y conflictos concurrentes conservan revisión anterior; nuevos huérfanos y anteriores retirados tienen limpieza durable reintentable.
7. Controllers/Services/Repositories y pipeline cumplen arquitectura y convenciones existentes; no migraciones destructivas ni subidas desde Services.
8. Validaciones y revisión reportan comandos y resultados reales, distinguiendo pruebas con fakes de proveedores reales.


### Contrato congelado de coordinación

La fuente compartida definitiva es src/types/catalog.types.ts (propietario DB): CatalogActor, AssetInput con size:number, UploadedMedia=AssetInput[], UploadContext con workId/chapterId/workSlug/actorId/batchId/expectedVersion/expectedUpdatedAt/creating; WorkRepositoryContract y ChapterRepositoryContract separados con list/findById/findForEdit/reserve/save/remove/abortReservation; TaxonomyRepositoryContract con listTypes/listGenres/createType/createGenre; MediaRepositoryContract con beginBatch/planObject/markUploaded/abandonBatch/reconcileExpiredBatches/claimCleanup/completeCleanup/failCleanup. Los DTO/consumidores deben ajustarse a esas interfaces, no a los nombres de propuesta preliminar. Las rutas de capítulos quedan anidadas bajo /works/:workId/chapters/:chapterId y verifican correspondencia de ambos IDs. Reservas ocultas mediante deletedAt sentinel; save(creating:true) las hace visibles según estado de publicación. El plan original no constituye evidencia de implementación o tests completados.

## Entrega verificada

- Usuario confirmó una imagen inicial por obra; consultar `GET /api/works/:workId` para obtener `incapBannerAsset` al abrir capítulos.
- Los middlewares reciben archivos en disco temporal con Multer, validan imágenes y ejecutan Blob put/copy. Services no importan Multer, filesystem ni Blob. `res.locals.uploadedMedia` y el contexto están tipados en Express.
- PUT/PATCH JSON o multipart sin adjuntos preserva todos los medios. Endpoints específicos de reemplazo/inserción requieren al menos una página.
- Límites definitivos: 10 MiB/imagen, 100 MiB/solicitud, 100 archivos/solicitud, 1000 páginas/capítulo; JPEG/PNG/WebP estático. PNG comprueba CRC y raster; JPEG/WebP validan estructura sin decodificación completa.
- Colisiones detectadas devuelven 409; se reintenta desde cliente con identificadores nuevos, sin sobrescribir. Número de capítulo borrado real permanece reservado; una creación fallida sin confirmar puede reusar su reserva oculta con el mismo actor.
- `startMediaCleanup` se ejecuta en `src/index.ts` al arrancar y cada minuto. Reemplazos encolan limpieza tras commit; lotes abandonados esperan 15 minutos y pendientes vencen tras una hora. No se borran archivos con referencias vigentes.
- `npm run build`: aprobado inicial/final. `npm run prisma:validate`: aprobado. No se añadieron scripts ni dependencias y no se ejecutaron migraciones.
- `node --import tsx --test tests/*.test.ts`: suite integrada inicial 26 aprobadas/0 fallos; se agregaron 6 tests de repositorios/cleanup y un smoke health/Swagger. Resultado final: 33 aprobadas, 0 fallos, 0 omitidas; ver `tests/README.md` para alcance y límites.
- Reviewer independiente no encontró P0/P1; señaló discrepancia P2 de códigos de error, corregida en contrato API y plan para reflejar 400/415/500/503 reales. Su segunda ronda verificó las correcciones y no encontró nuevos bugs concretos. Security inició revisión y no pudo cerrarla por cuota; no equivale a auditoría aprobada. El coordinador completó lectura de permisos, journaling y limpieza.
- No se verificaron PostgreSQL/Blob reales ni carreras multiproceso. Blob público permite acceder a imágenes por URL incluso si la API oculta un borrador; baja lógica no revoca cachés externas inmediatamente.
- Commits integrados en feature: DB `e7a586a`, Media `7530e6c`, API `bb99b94`, tests `e4249a9`; ajustes de integración/documentación del coordinador en commit posterior. No integración a QA/main ni push.
- Solicitud de traer dev: incorporado `origin/dev` local `b0cd41a` por fast-forward (mismo árbol que base). Tres intentos de fetch remoto fallaron por conexión/reset con github.com:443; no se pudo certificar si el servidor tiene commits posteriores.

| Feature | Etapa | Agente | Resultado y validación |
| --- | --- | --- | --- |
| Obras/capítulos | Plan y arquitectura | planner / architect | Contratos y aceptación documentados; sin migración |
| Obras/capítulos | Persistencia | db | Transacciones, permisos, versiones y reservas; build aprobado |
| Archivos | Middlewares | media | Multer, firmas, Blob, journal y limpieza; build aprobado |
| Obras/capítulos | API | dev / coordinador | Rutas, schemas, controller/service y docs integrados; build aprobado |
| Conjunto | Pruebas | test / coordinador | HTTP, servicios, archivos, repositorios y worker con dobles; proveedores reales pendientes |
| Conjunto | Revisión | reviewer / security | Reviewer sin críticos; P2 documental corregido. Auditoría Security incompleta por cuota |

Aceptación funcional cubierta por código y pruebas con dobles; aceptación operativa con proveedores reales y aprobación humana de QA pendientes. Etapas de migración omitidas porque el esquema existente cubre el dominio; no se omitió implementación de archivos.

