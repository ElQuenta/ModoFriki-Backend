# Tasks: Administración segura, sanciones e imágenes

**Input**: Diseño en `specs/001-admin-community-media/`.
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [HTTP](contracts/http-api.md), [persistencia](contracts/persistence.md), [quickstart.md](quickstart.md) y [constitución](../../.specify/memory/constitution.md).
**Created**: 2026-10-29.
**Tests**: Incluidos por los escenarios/criterios de aceptación del spec y por la exigencia constitucional de verificar permisos, persistencia, concurrencia y fallos parciales. Pruebas de cada historia antes de su implementación; comprobar que fallan por la capacidad aún ausente, no por apuntar a proveedores incorrectos.
**Organization**: Cuatro historias independientemente demostrables, con preparación compartida y cierre transversal. Fases 1 y 2 completadas el 2026-10-30; fases 3–7 pendientes. Evidencia en `validation/`, incluidos resultados de build y pruebas unitarias; las pruebas de proveedores reales siguen pendientes.

## Format: `[ID] [P?] [Story] Description`

- IDs T001–T067, consecutivos. `[US1]`–`[US4]` identifican la historia y solo aparecen en sus fases.
- `[P]` señala archivos independientes que pueden trabajarse en paralelo una vez cumplidas sus dependencias. No autoriza editar el mismo archivo desde dos responsables.
- Cada tarea declara responsable, ruta y dependencias. Las dependencias entre fases también aplican aunque no se repitan todos sus IDs en cada línea.
- Paths relativos a la raíz del repositorio existente; las rutas nuevas se crean durante implementación. No regenerar el proyecto ni añadir dependencias por rutina.

## Phase 1: Setup — preparación del backend existente

**Objetivo**: Confirmar contexto, propiedad y condiciones de seguridad antes de escribir código. Ninguna tarea requiere acceso implícito a producción.

- [X] T001 Inspeccionar `package.json`, `package-lock.json`, `tsconfig.json`, `prisma/schema.prisma`, `prisma.config.ts`, `src/config/database/`, `src/config/env.ts`, `src/app.ts`, `src/index.ts`, handlers/middlewares/utils afectados y registrar scripts/versiones/estado Git en `specs/001-admin-community-media/validation/preflight.md`; conservar Node/Express/Prisma/Mongoose/Joi/Multer/Blob/Vitest actuales, sin `.env` ni secretos. Responsable: coordinador. Dependencias: ninguna.
- [X] T002 Coordinar revisión de calidad de requisitos de `specs/001-admin-community-media/checklists/security.md` y comprobar `specs/001-admin-community-media/checklists/requirements.md`, registrando hallazgos y responsables en `specs/001-admin-community-media/validation/requirements-review.md`; las 40 casillas de seguridad pertenecen al revisor, no se aprueban automáticamente al iniciar implementación ni se confunden con pruebas pasadas. Responsable: coordinador/revisor. Dependencias: T001.
- [X] T003 Definir rama feature/admin-community-media y, solo si se delega implementación, preparar sesiones/worktrees aislados ../wt-mf-db, ../wt-mf-admin, ../wt-mf-community, ../wt-mf-media y ../wt-mf-test, con las ramas agent/admin-community-media-* indicadas en `specs/001-admin-community-media/plan.md`; registrar propietarios y orden de integración en `specs/001-admin-community-media/validation/ownership.md`, sin commits a main/QA ni descartar trabajo ajeno. Responsable: coordinador. Dependencias: T001–T002.
- [X] T004 Documentar en `specs/001-admin-community-media/validation/test-environments.md` destinos desechables SQL/Mongo replica set y Blob de pruebas, inyección segura de variables, barreras de carrera y tratamiento de discrepancia del baseline citado en `prisma/README.md`; no consultar/modificar base compartida sin alcance autorizado ni ejecutar seed/reset/db push. Responsable: test/DB. Dependencias: T001–T003.

## Phase 2: Foundational — contratos e infraestructura compartida

**Objetivo**: Entregar fundamentos reutilizables sin sustituir autenticación, conexiones o handlers. Bloquea implementación de historias hasta T010; la revisión de T002 no se evita marcando casillas desde un worker.

- [X] T005 Definir contratos tipados de repositorios/DTO/actores/cursores en `src/types/admin.types.ts`, `src/types/sanctions.types.ts` y `src/types/comment-creation.types.ts`, siguiendo `contracts/http-api.md` y `contracts/persistence.md`: proyección sin email/hash/normalizados, UUID, fechas UTC, restricciones y estados literales del modelo, sin Request/Response ni cuerpo de comentario SQL. Responsable: DB/coordinador. Dependencias: T004.
- [X] T006 Implementar y documentar helper parametrizado `src/repositories/user-locks.ts`: deduplicar UUID y bloquear User en orden ascendente antes de Work/relaciones, obtener hora SQL después de locks y reutilizar cliente transaccional existente; sin llamadas Mongo/Blob dentro de transacciones SQL. Responsable: DB. Dependencias: T005.
- [X] T007 [P] Crear `src/middlewares/admin-validation.middleware.ts` para validar params/query/body con Joi y `stripUnknown:false`, usando AppError/handlers actuales y sin cambiar el comportamiento de `src/middlewares/validateQuery.middleware.ts`; esquema desconocido o campo privilegiado debe rechazarse, no eliminarse silenciosamente. Responsable: dev admin. Dependencias: T005.
- [X] T008 [P] Crear helpers de prueba en `src/__tests__/helpers/http.ts` y `src/__tests__/helpers/integration.ts` con servidor efímero Node+fetch, fixtures UUID propios, barreras deterministas y teardown limitado a recursos creados por la ejecución; no agregar Supertest/Testcontainers ni usar seed administrativo. Responsable: test. Dependencias: T004–T005.
- [X] T009 Crear `vitest.integration.config.ts` con include exclusivo `src/**/__tests__/**/*.integration.test.ts` y TEST_DATABASE_URL/TEST_MONGODB_URI explícitas; actualizar `vitest.config.ts` para excluir `**/*.integration.test.ts` conservando exclusiones predeterminadas y URLs ficticias. Config de integración no hereda env ficticio, valida destinos desechables antes de importar clientes y rechaza configuración ausente; probar inventarios disjuntos y npm test sin destinos reales ni importación de fixtures de integración. Responsable: test. Dependencias: T008.
- [X] T010 Crear y ejecutar `src/repositories/__tests__/user-locks.test.ts` y `src/middlewares/__tests__/admin-validation.test.ts`, verificar contratos base, orden de locks y desconocidos, y registrar foundation/build checks disponibles en `specs/001-admin-community-media/validation/foundation.md`; ninguna comprobación simulada acredita carreras reales. Responsable: test. Dependencias: T006–T009.

**Checkpoint**: Fundamentos disponibles, owners establecidos, tipos entregados y entornos de prueba explícitos. Los esquemas/migraciones de cada historia siguen siendo propiedad única de DB.

## Phase 3: US1 — Roles y asignaciones protegidas (Priority: P1, MVP)

**Goal**: ADMIN activo lista y administra BASIC/EDITOR, mantiene cuentas ADMIN protegidas y concede/revoca acceso por obra con auditoría.
**Independent Test**: Con fixtures de los tres roles y estados ACTIVE/SUSPENDED/DELETED, recorrer lista, cambiar ambos sentidos, asignar/revocar/reasignar y competir contra un guardado editorial. Estado y sanciones no cambian; versión vieja falla y la degradación registra revocaciones atómicas.

### Tests primero

- [X] T011 [P] [US1] Escribir pruebas unitarias de la matriz rol/estado, proyecciones, no-op/versión obsoleta y revocaciones por degradación en `src/services/__tests__/admin.service.test.ts`; incluir actor no ADMIN, propio/otro ADMIN protegido y destinatarios eliminados. Responsable: test. Dependencias: T010.
- [X] T012 [P] [US1] Escribir contratos HTTP y pruebas SQL de roles/asignaciones en `src/routes/__tests__/admin.routes.test.ts` y `src/repositories/__tests__/admin.integration.test.ts`: cursores empatados, campos desconocidos, auditoría atómica/rollback y revocación antigua tras reasignación. Responsable: test. Dependencias: T010.

### Implementación

- [X] T013 [US1] Extender `prisma/schema.prisma` y preparar offline `prisma/migrations/20261029000100_admin_assignments/migration.sql` con las restricciones literales «version INTEGER NOT NULL DEFAULT 1 con CHECK positivo», «createdAt TIMESTAMPTZ(3) NOT NULL», «UNIQUE(workId,editorId)» y «FK RESTRICT»; backfill createdAt desde assignedAt, conservarlo inmutable y añadir índice (editorId,createdAt,id), preservando Example y restricciones existentes; ejecutar prisma:validate/prisma:generate para entregar el cliente tipado antes de consumidores, sin aplicar a base compartida. Responsable: DB. Dependencias: T011–T012.
- [X] T014 [US1] Crear `src/middlewares/schemas/admin.schema.ts` para UUID, role BASIC/EDITOR, estado ACTIVE/SUSPENDED, expectedUpdatedAt ISO milisegundos, expectedVersion entero ≥0 al asignar y ≥1 al revocar, limit=20/100 máximo, pareja cursor completa e includeRevoked=false; rechazar flags/campos internos y desconocidos mediante T007. Responsable: dev admin. Dependencias: T013.
- [X] T015 [US1] Implementar `src/repositories/auth/admin.repository.ts`: listado/detail no eliminados sin finder ACTIVE de autenticación; cambio rol con «updatedAt a max(hora SQL, anterior+1ms)»; asignaciones versionadas y createdAt estable; degradación revoca todas, incrementa versión por relación y escribe ROLE_CHANGED/EDITOR_REVOKED atómicos, sin restauración automática; estado actual solo no-op con precondición actual, stale=409. Responsable: dev admin. Dependencias: T006,T013–T014.
- [X] T016 [US1] Implementar `src/services/auth/admin.service.ts` con ADMIN activo, protección propia/ajena de ADMIN, destinatario BASIC/EDITOR ACTIVE o SUSPENDED no eliminado, conservación de estado/sanción; asignar solo EDITOR ACTIVE y obra existente, revocar permite suspendido; proyección y paginación conforme contrato. Responsable: dev admin. Dependencias: T015.
- [X] T017 [US1] Implementar `src/controllers/auth/admin.controller.ts` extrayendo params/query/body e identidad de res.locals, llamando solo Services y usando handlers actuales; devolver AdminUser/Assignment sin secretos ni acceso Prisma directo. Responsable: dev admin. Dependencias: T016.
- [X] T018 [US1] Crear `src/routes/admin.routes.ts` con GET users/detail, PATCH role, GET assignments, PUT assignment y PATCH revocation, orden authenticate→authorize ADMIN→Joi estricto→controller; no añadir endpoint de borrar usuarios o crear/promover ADMIN. Responsable: dev admin. Dependencias: T014,T017.
- [X] T019 [US1] Integrar T006 en `src/repositories/catalog/catalog.persistence.ts`, `src/repositories/catalog/work.repository.ts`, `src/repositories/catalog/chapter.repository.ts` y `src/repositories/catalog/media.repository.ts`: User→Work en reserva/guardado/baja/journal, revalidar asignación antes de commit y conservar timeout actual de 30s de guardado de capítulos; revocación/degradación concurrente no confirma una edición posterior. Responsable: media, único owner de catálogo. Dependencias: T015,T018.
- [X] T020 [US1] Registrar router administrativo en `src/app.ts` y documentar endpoints/errores/DTO en `docs/API.md` y `openapi.yaml`, conservando envelope y rutas existentes; incluir consulta detalle para refrescar CAS y assignedAt/createdAt/version en relaciones. Responsable: coordinador. Dependencias: T018–T019.
- [X] T021 [US1] Ejecutar pruebas de T011–T012 y carrera revocación/degradación frente a catálogo con barreras SQL reales; aplicar migración solo al destino desechable verificado, ejecutar prisma:validate/prisma:generate y build, registrar resultados en `specs/001-admin-community-media/validation/us1.md`, sin afirmar pruebas omitidas. Responsable: test/DB. Dependencias: T020.
- [X] T022 [US1] Revisar cumplimiento FR-001–005/021 y SC-001–003/008 en `specs/001-admin-community-media/validation/us1.md`, corregir hallazgos en archivos de su owner y entregar MVP de administración demostrable sin depender de endpoints de sanciones o banners. Responsable: coordinador/reviewer. Dependencias: T021.

**Checkpoint**: US1 aceptable por sí sola. Integración a QA mantiene su aprobación humana final; completar un checkbox no la autoriza.

## Phase 4: US2 — Sanciones y creación de comentarios segura (Priority: P1)

**Goal**: ADMIN impone/revoca sanciones BASIC/EDITOR; todos los caminos de creación pendientes quedan bloqueados desde la confirmación, sin publicación parcial entre proveedores.
**Independent Test**: Temporal/permanente/revocación, evidencia opcional y privacidad; pausar staging raíz/respuesta, confirmar sanción y dejar llegar escritura tardía: queda inaccesible por todos los endpoints. COMMITTED previo permanece; caídas/timeout nunca abren acceso.

### Tests primero

- [X] T023 [P] [US2] Escribir pruebas de reglas y DTO en `src/services/__tests__/comment-sanctions.service.test.ts` y `src/middlewares/schemas/__tests__/comment-sanctions.schema.test.ts`: motivo/fechas, ADMIN excluido, expiración exacta sin cron, evidencia opcional/ajena, revocación por UUID antiguo y datos propios restringidos. Responsable: test. Dependencias: T010.
- [X] T024 [P] [US2] Escribir pruebas con barreras SQL+Mongo replica set en `src/repositories/__tests__/comment-creation.integration.test.ts` y `src/repositories/__tests__/comment-sanctions.integration.test.ts`: sanción/decisión ganadoras, timeout y write tardío, resultado SQL incierto, crash, replay y expiración sin resucitar REJECTED; añadir despublicación/baja de WORK, CHAPTER y obra padre en ambos órdenes frente a finalize, esperando TARGET_UNAVAILABLE persistido y 404 si gana la retirada. Cubrir provisional examinado que confirma detrás del cursor y aparece al refrescar desde la primera página. Responsable: test. Dependencias: T010.
- [X] T025 [P] [US2] Escribir contratos HTTP de sanciones/vista propia/Idempotency-Key y acceso oculto en `src/routes/__tests__/comment-sanctions.routes.test.ts` y `src/routes/__tests__/community-publication.routes.test.ts`; cubrir 403 de sanción sin cierre de sesión, 503 y páginas vacías con hasMore/cursor que avanza. Responsable: test. Dependencias: T010.

### Modelos y contratos

- [X] T026 [US2] Añadir CommentSanction y CommentCreationDecision a `prisma/schema.prisma` y preparar `prisma/migrations/20261029000200_comment_sanctions_decisions/migration.sql`: sanción «UUID PK, generado en servidor», userId/imposedById «UUID FK User RESTRICT», reason «VARCHAR(2000), trim, 1–2000 caracteres», startsAt «TIMESTAMPTZ(3), hora SQL después de locks», endsAt «TIMESTAMPTZ(3) nullable; null significa permanente, fin estrictamente posterior al inicio», revokedAt/revokedById «Nullable, ambos o ninguno», closedAt «Nullable», evidenceType/evidenceId «Ambos null o COMMENT/REPORT + UUID»; añadir CHECK «motivo no vacío», «coherencia par evidencia», «fin>inicio», «revokedAt>=inicio», tabla exhaustiva de cierre: abierta con los tres NULL; revocada con fecha/actor NOT NULL, closedAt=revokedAt>=startsAt y, si endsAt existe, revokedAt<endsAt; vencida con revokedAt/revokedById NULL y closedAt=endsAt NOT NULL, cierre solo después de vencer bajo lock e índices (userId,startsAt DESC,id DESC) y único parcial «userId WHERE closedAt IS NULL». Decisión: id «UUID PK; también UUID del nuevo comentario y operación», authorId «UUID FK User RESTRICT», state «PREPARED, COMMITTED o REJECTED», requestFingerprint «SHA-256 de campos canónicos de la solicitud; no cuerpo ni copia del comentario», preparedAt/expiresAt «TIMESTAMPTZ(3), plazo de preparación 60 segundos», decidedAt «Nullable hasta decisión terminal», rejectionCode «Nullable; SANCTIONED, ACCOUNT_UNAVAILABLE, EXPIRED, CANCELLED, TARGET_UNAVAILABLE»; índices (authorId,state,id)/(state,expiresAt,id), CHECK explícitos: expiresAt=preparedAt+60 segundos, decidedAt NULL o >=preparedAt; PREPARED exige decidedAt/rejectionCode NULL, COMMITTED exige decidedAt NOT NULL y <expiresAt y rejectionCode NULL, REJECTED exige decidedAt NOT NULL y rejectionCode permitido NOT NULL, usando IS NULL/IS NOT NULL; transiciones terminales inmutables. Extender auditoría COMMENT_SANCTION_IMPOSED y COMMENT_SANCTION_REVOKED y «sanctionId UUID nullable FK CommentSanction RESTRICT»; ejecutar prisma:validate/prisma:generate antes de consumidores sin editar código generado ni aplicar a base compartida. Responsable: DB. Dependencias: T013,T023–T025; serializar edición de schema con las otras historias.
- [X] T027 [US2] Crear `src/middlewares/schemas/comment-sanctions.schema.ts` con reason trim 1..2000, endsAt explícito ISO/null, evidence opcional COMMENT/REPORT+UUID, params y cursor; no startsAt/actor/closedAt del cliente y no desconocidos. Alinear `src/types/sanctions.types.ts` y `src/types/comment-creation.types.ts` con T026 antes de consumidores. Responsable: DB/dev community secuenciados. Dependencias: T026.

### Persistencia y servicios

- [X] T028 [US2] Implementar `src/repositories/community/comment-sanction.repository.ts` con locks actor/destinatario, hora SQL posterior al lock, cierre de vencida con closedAt=endsAt, unicidad vigente, auditoría atómica y rechazo de todas las PREPARED al imponer; revocar UUID concreto idempotente sin tocar posterior, historial paginado/current independiente del cursor. Responsable: dev community. Dependencias: T006,T026–T027.
- [X] T029 [US2] Implementar `src/repositories/community/comment-creation.repository.ts`: prepare/finalize/findDecisions/rejectExpired, «COMMITTED/REJECTED terminales», CAS state=PREPARED, 60s sin ampliación, huella/autor/UUID únicos y reloj SQL. finalize recibe stagedTarget derivado del documento Mongo durable, toma User→Work y revalida cuenta, sanción, vencimiento, publicación, baja y pertenencia de obra/capítulo usando el mismo lock de mutaciones de catálogo. Retirada ganadora confirma REJECTED/TARGET_UNAVAILABLE y devuelve resultado tipado; Service traduce a 404 después del commit, sin AppError que revierta el rechazo. Replay no modifica terminales; ninguna red Mongo dentro de SQL. Responsable: dev community. Dependencias: T028.
- [X] T030 [US2] Ampliar `src/models/community/comment.model.ts` y `src/models/community/community.types.ts` con «creationOperationId UUID opcional, inmutable y no controlable por body público»; nuevos documentos siempre lo llevan igual a _id, índice único parcial para valores string, legacy únicamente con campo ausente, nunca null/malformado/inconsistente; conservar status/revision y todos los índices actuales. Responsable: dev community. Dependencias: T026–T029.
- [X] T031 [US2] Implementar stageRoot/stageReply con UUID estable en `src/repositories/community/comment.repository.ts`: no sobrescribir al reintentar, confirmar majority y recuperar existente mediante lectura primary/majority comparando autor/marcador/campos canónicos; duplicate-key no acredita durabilidad y retry no repite efectos sobre padre. Responsable: dev community. Dependencias: T030.
- [X] T032 [US2] Adaptar `src/repositories/community/community.persistence.ts` para preservar la sesión transaccional, comprobación/touch del padre ACTIVE y revisión, aceptando únicamente referencias ya admitidas por decisión inmutable; eliminación anterior al staging impide respuesta y posterior conserva tombstone/hilo; sin Promise.all dentro de sesión ni fallback standalone. Responsable: dev community. Dependencias: T031.
- [X] T033 [US2] Crear `src/services/community/comment-creation.service.ts` que coordine prepare→staging durable→finalize, huella canónica y replay por Idempotency-Key opcional con node:crypto, sin Request/Response; obtener stagedTarget desde metadatos Mongo verificados y transmitirlo al repositorio para revalidación SQL. Traducir TARGET_UNAVAILABLE a 404 solo después de persistir el rechazo; no devolver aceptación antes de COMMITTED ni asumir que timeout significa ausencia de guardado. Responsable: dev community. Dependencias: T029–T032.
- [X] T034 [US2] Integrar coordinación en `src/services/community/community.service.ts`, extraer cabecera opcional UUID en `src/controllers/community/community.controller.ts` y conservar `src/routes/community.routes.ts`/body/handlers actuales; cubrir raíz y respuesta, 403 estable de restricción y 503 de resultado incierto, sin privilegios o marcador aportados por body. Responsable: dev community. Dependencias: T033.
- [X] T035 [US2] Incorporar findAccessibleById/filterAccessibleBatch en `src/services/community/community.service.ts`, `src/repositories/community/comment.repository.ts`, `src/repositories/community/comment-vote.repository.ts` y `src/repositories/community/comment-report.repository.ts`: raíces/respuestas/thread/id/edit/delete/vote/report/parent/evidencia exigen COMMITTED para marcados, lote SQL único por candidatos, limit+1 acotado y cursor del último examinado; ausencia/PREPARED/REJECTED se ocultan y caída SQL da 503, sin fallback legacy. Mantener recorrido no instantáneo: confirmar detrás del cursor exige refrescar desde primera página y sustituir la colección local, sin prometer actualización retroactiva. Responsable: dev community. Dependencias: T034.
- [X] T036 [US2] Implementar `src/services/community/comment-sanctions.service.ts` y, si necesita lookup de evidencia, el contrato mínimo de `src/repositories/community/comment-report.repository.ts`: validar comentario/report→comment y autor antes de imponer; motivo obligatorio, vínculo opcional, sin snapshots o datos de reporteros; vista propia sin actor/evidencia/historial y resolución de reportes independiente. Responsable: dev community. Dependencias: T028,T035.
- [X] T037 [US2] Crear `src/controllers/community/comment-sanctions.controller.ts` y `src/routes/comment-sanctions.routes.ts` con GET/POST historial/imposición y PUT revocación del contrato, guards antes de validar y service como única lógica; no aceptar sanciones a ADMIN ni autorrevocación de BASIC/EDITOR. Responsable: dev community. Dependencias: T027,T036.
- [X] T038 [US2] Registrar router en `src/app.ts`, GET `/auth/me/comment-restriction` en `src/routes/auth.routes.ts` y documentar sanciones/reintentos/privacidad/cursor/error estable en `docs/API.md` y `openapi.yaml`, sin alterar el envelope ni interpretar 403 como logout. Responsable: coordinador. Dependencias: T020,T037.
- [X] T039 [US2] Crear `src/scripts/reconcile-comment-creations.ts` con inspección por defecto, --apply explícito, autor/ids y máximo 100 registros, usando repositorios; solo rechazar PREPARED vencidas bajo locks, no confirmar huérfanas/purgar contenido ni programar worker, y logs de conteos/IDs/códigos sin motivos/cuerpos/huellas/tokens. Responsable: dev community. Dependencias: T029,T035,T038.
- [X] T040 [US2] Ejecutar T024–T025 contra proveedores desechables, con muerte/commit incierto, raíz/respuesta, todos los caminos ocultos, padre retirado antes/después de staging y replay; incluir despublicación/baja de obra/capítulo/obra padre frente a finalize y demostrar 404 con TARGET_UNAVAILABLE terminal cuando gana retirada. Verificar recorrido no instantáneo: una confirmación detrás del cursor aparece al reiniciar desde primera página, no al continuar; comprobar consultas acotadas y ausencia estricta de marcador legacy. Registrar resultados en `specs/001-admin-community-media/validation/us2-concurrency.md`. Responsable: test. Dependencias: T038–T039.
- [X] T041 [US2] Ejecutar T023, prisma:validate/prisma:generate, build y restricciones/revocación/expiración/auditoría con SQL real en `src/repositories/__tests__/comment-sanctions.integration.test.ts`; probar cada combinación válida e inválida de las tablas de data-model.md (estado/decidedAt/rejectionCode, revokedAt/revokedById/closedAt), límites, huella, evidencia y TARGET_UNAVAILABLE, incluyendo NULL SQL que no puede eludir CHECK. Registrar resultados en `specs/001-admin-community-media/validation/us2.md`. Responsable: test/DB. Dependencias: T040.
- [X] T042 [US2] Revisar FR-006–012/022 y SC-004/009 en `specs/001-admin-community-media/validation/us2.md`, dejando explícito que el journal SQL guarda permiso sin Markdown, que el corte sin writers antiguos es obligatorio y que ninguna prueba simulada sustituye las carreras reales; corregir hallazgos con su owner antes de aceptar historia. Responsable: coordinador/reviewer. Dependencias: T041.

**Checkpoint**: US2 demostrable sin UI administrativa de US1 mediante fixtures. No activar nuevo staging en despliegue hasta actualizar todos los caminos y drenar lectores/writers antiguos.

### Registro de ejecución US2

- [X] T033–T035 — Coordinación prepare/stage/finalize y accesibilidad centralizada, validadas por los contratos HTTP y la integración SQL/Mongo.
- [X] T036–T039 — Sanciones, rutas, vista propia, montaje, documentación y reconciliación manual acotada.
- [X] T040–T041 — Evidencia con PostgreSQL/MongoDB desechables en `validation/us2-concurrency.md` y `validation/us2.md`.
- [X] T042 — Revisión de seguridad independiente sin hallazgos bloqueantes; riesgo operativo de rate limit in-memory documentado.

## Phase 5: US3 — Tres imágenes y apertura incluida (Priority: P2)

**Goal**: Portada, banner de ficha y apertura independientes, con publicación compatible y detalle de lectura aditivo.
**Independent Test**: Crear borrador, cargar tres imágenes, publicar, obtener obra y dos capítulos, sustituir solo una imagen y comprobar N/N+1 con pages idéntico; probar histórica exenta y borrador antiguo no exento.

### Tests primero

- [ ] T043 [P] [US3] Ampliar `src/services/__tests__/catalog.service.test.ts` con tres campos, referencias omitidas conservadas, primera publicación incompleta rechazada antes de Blob, exención histórica y N/N+1 sin deduplicar páginas iguales; preservar mocks del tipo de mutación/listado mediante tipo de detalle separado. Responsable: test, con archivo reservado a esta tarea. Dependencias: T010.
- [ ] T044 [P] [US3] Escribir contrato de detalle/multipart en `src/routes/__tests__/catalog-images.routes.test.ts`: bannerAsset nullable, lectura sin consulta adicional, pages intacto, guards antes de recepción y ningún flag interno en DTO público. Responsable: test. Dependencias: T010.
- [ ] T045 [P] [US3] Escribir fixtures de migración y fallos multimedia en `src/repositories/__tests__/catalog-images.integration.test.ts` y `src/middlewares/media/__tests__/work-media.test.ts`: publicación histórica hoy DRAFT, PUBLISHED inconsistente, MIME/contenido/tamaño/cantidad y error de persistencia tras subir. Responsable: test. Dependencias: T010.

### Implementación

- [ ] T046 [US3] Añadir a `prisma/schema.prisma` y preparar `prisma/migrations/20261029000300_work_detail_banner/migration.sql` «bannerAssetId UUID nullable FK MediaAsset RESTRICT», relación bannerAsset/inversa workBanners y «legacyPublicationImagesExempt BOOLEAN NOT NULL DEFAULT false, interno e inmutable desde API»; backfill solo publicación previa acreditada por «publishedAt IS NOT NULL» durante corte, incluidas DRAFT previamente publicadas; PUBLISHED sin fecha/portada requiere reconciliación. CHECK «si publicationStatus=PUBLISHED, coverAssetId no null y (legacyPublicationImagesExempt=true o bannerAssetId e incapBannerAssetId no null)»; conservar ChapterPage «1..1000» y SiteSettings sin cambios; ejecutar prisma:validate/prisma:generate antes de consumidores, sin aplicar a base compartida. Responsable: DB. Dependencias: T026,T043–T045; serializar schema.
- [ ] T047 [US3] Extender `src/types/catalog.types.ts` y `src/repositories/catalog/catalog.persistence.ts` con bannerAsset/workBanners, Work DTO público sin exención interna y ChapterDetailRecord separado de ChapterRecord; definir unión readingImages WORK_OPENING con pageId/position null o PAGE con sus IDs/posiciones, preservando tipos usados en mutaciones. Responsable: media. Dependencias: T019,T046.
- [ ] T048 [P] [US3] Extender `src/middlewares/media/receive.middleware.ts` y `src/utils/media-paths.ts` para `banner` individual y namespace Banners, manteniendo cover/Covers, inpagecover/CoverPage, slug estable, firma de contenido existente y límites «10 MiB por archivo y 100 MiB por petición»; sin sharp/file-type ni nombres/rutas del cliente. Responsable: media. Dependencias: T010. La recepción/paths se entregan antes de modificar prepare y no dependen de la migración.
- [ ] T049 [US3] Actualizar `src/services/catalog/catalog.service.ts` de 2→3 campos y preparar publicación con referencias efectivas previas+nuevas: DRAFT incompleto válido, sin exención publicar requiere tres antes de Blob, histórico no se bloquea y editar sin archivos conserva referencias; no operaciones Blob desde Service. Responsable: media. Dependencias: T047–T048.
- [ ] T050 [US3] Actualizar `src/repositories/catalog/work.repository.ts` para aceptar/persistir tres activos válidos, revalidar política bajo locks y expectedUpdatedAt, no enlazar MediaAsset DELETING, conservar exención al despublicar/republicar y desvincular tres referencias al dar baja lógica sin borrar Blob; no cambiar permisos de eliminación heredados. Responsable: media. Dependencias: T049.
- [ ] T051 [US3] Consultar apertura vigente del padre en `src/repositories/catalog/chapter.repository.ts`, componer readingImages en `src/services/catalog/catalog.service.ts` y ajustar proyección en `src/controllers/catalog/catalog.controller.ts` para no filtrar legacyPublicationImagesExempt hacia la respuesta; conservar pages/Decimal/BigInt actuales, posiciones, version y ausencia de efectos de GET. Responsable: media. Dependencias: T050.
- [ ] T052 [US3] Añadir `workBanners: { none: {} }` a la prueba de ausencia de referencias en `src/repositories/catalog/media.repository.ts` y cubrirla en `src/repositories/__tests__/media-references.integration.test.ts`; borrar exclusivamente generaciones de páginas sustituidas después del commit, nunca banners/abandonados/expirados, sin reintento periódico. Responsable: media; test edita solo su archivo después de entrega. Dependencias: T051.
- [ ] T053 [US3] Actualizar `docs/API.md` y `openapi.yaml` con banner, readingImages y política de refresco de comentarios sin instantánea; crear `specs/001-admin-community-media/validation/frontend-contract.md` con repositorio, versión/SHA, responsable, fecha, entorno, evidencia y aceptación explícita del consumidor. Definir escenarios de página vacía con hasMore=true, confirmación tardía y reinicio desde primera página, apertura no duplicada y progreso conservado; recopilar sus resultados reales o registrar dependencia externa PENDIENTE, sin afirmar validar otro repo ni enviar mensajes sin autorización. La aceptación pendiente bloquea el gate de T067, no las pruebas backend T054. Responsable: coordinador. Dependencias: T038,T052.
- [ ] T054 [US3] Ejecutar T043–T045/T052, migraciones en SQL desechable, prisma:validate/prisma:generate, build y pruebas Blob solo con almacén autorizado de test; incluir guardado con 1000 páginas, mantener timeout 30s y verificar rollback/collision/CAS/permisos perdidos en subida, registrando evidencia en `specs/001-admin-community-media/validation/us3.md`. Responsable: test/DB/media. Dependencias: T053.
- [ ] T055 [US3] Revisar FR-013–016/018–020 y SC-005–007 en `specs/001-admin-community-media/validation/us3.md`, comprobar exención fija, nuevas publicaciones completas, DTO sin flag interno y dependencias consumidor explícitas; corregir hallazgos antes de aceptar la historia. Responsable: coordinador/reviewer. Dependencias: T054.

**Checkpoint**: US3 aporta imágenes y lectura sin necesitar sanciones activas. La edición compartida de schema se serializa por DB; la aceptación de la historia no sustituye el ensayo de corte completo.

### Registro de ejecución US3

- [X] T043–T045 — Contratos de catálogo, DTO y fixtures de integración ampliados para tres activos, publicación histórica y nuevas restricciones SQL.
- [X] T046–T052 — Migración aditiva, persistencia, pipeline multipart, rutas Blob, composición `readingImages` y protección de referencias a banners.
- [X] T053 — API/OpenAPI y contrato de consumidor actualizados; la aceptación externa permanece explícitamente PENDIENTE en `validation/frontend-contract.md`.
- [X] T054–T055 — Prisma, build, unitarias e integración sobre PostgreSQL/MongoDB desechables ejecutados y requisitos US3 revisados en `validation/us3.md`.

## Phase 6: US4 — Mensaje final como página ordinaria (Priority: P2)

**Goal**: EDITOR asignado o ADMIN puede añadir su mensaje como última página, sin recursos ni inserciones automáticas de cierre.
**Independent Test**: Capítulos con/sin mensaje final, con apertura, y edición/inserción/reordenación normales; cierre cuenta para límites, pages y posiciones siguen el orden editorial confirmado.

- [ ] T056 [P] [US4] Escribir regresión HTTP/lectura en `src/routes/__tests__/chapter-closing-page.routes.test.ts`: última página elegida por editor aparece una vez, cierre ausente no impide publicar, apertura inicial no cuenta y cierre sí cuenta para 100/1000 páginas. Responsable: test. Dependencias: T010; preparar fixtures independiente de implementación de US3.
- [ ] T057 [US4] Documentar en `docs/API.md` y ejemplos de `openapi.yaml` que el mensaje final usa pages multipart normal, sin campo/endpoints/modelo nuevo, y su posición se conserva o cambia solo por operaciones editoriales existentes; no usar SiteSettings.generalBannerAsset como cierre. Responsable: coordinador. Dependencias: T053,T056.
- [ ] T058 [US4] Ejecutar T056 sobre `src/routes/catalog.routes.ts` y `src/repositories/catalog/chapter.repository.ts`, incluyendo sustitución/inserción/reordenación y permisos de EDITOR asignado; corregir únicamente desvíos revelados con el owner media, sin introducir semántica especial, registrando resultados en `specs/001-admin-community-media/validation/us4.md`. Responsable: test/media secuenciados. Dependencias: T055,T057.
- [ ] T059 [US4] Revisar FR-017 y escenarios de historia 4 en `specs/001-admin-community-media/validation/us4.md`, acreditando flujo ordinario con y sin apertura, todos los recuentos y ausencia de cierre automático; no afirmar funcionalidad nueva si el soporte ya existía. Responsable: coordinador/reviewer. Dependencias: T058.

**Checkpoint**: US4 es principalmente regresión y contrato sobre una capacidad existente; no justifica crear nuevas entidades ni dependencias.

### Registro de ejecución US4

- [X] T056 — Regresión HTTP y de servicio para apertura opcional, última página ordinaria y límites editoriales.
- [X] T057 — Contrato API/OpenAPI documenta el cierre como `pages` normal, sin campos ni recursos especiales.
- [X] T058 — Flujo existente de reemplazo, inserción, reordenamiento, permisos y CAS verificado contra PostgreSQL desechable.
- [X] T059 — FR-017 revisado y evidencia registrada en `validation/us4.md`.

## Phase 7: Polish — verificación e integración transversal

**Objetivo**: Cerrar evidencias, revisión y preparación del despliegue sin integrar automáticamente en QA ni tocar producción.

- [X] T060 Sincronizar documentación final `docs/API.md`, `openapi.yaml`, `prisma/README.md` y `specs/001-admin-community-media/quickstart.md` con implementación y migraciones reales; dejar consistente el baseline tras su investigación, las versiones, escenarios, comandos existentes y limitaciones del consumidor; no inventar npm run lint. Responsable: coordinador. Dependencias: T022,T042,T055,T059.
- [X] T061 Ejecutar npm run prisma:validate, npm run prisma:generate, npm run build, npm test y npx vitest run --config vitest.integration.config.ts en destinos definidos; demostrar inventarios unitario/integración disjuntos, npm test sin TEST_* ni conexión real e integración que falla si faltan destinos explícitos. Medir fixtures 10 000 cuentas/decisiones con lotes acotados sin N+1, preservar regresión auth/community/catalog/reading/discovery y registrar resultados en `specs/001-admin-community-media/validation/final-checks.md`. Responsable: test/coordinador. Dependencias: T060.
- [ ] T062 Ensayar en entorno desechable migración, captura de exención y corte exclusivo de writers/lectores antiguos, recuperación por fallo y rollback solo a versión compatible con decisiones; registrar respaldos/restauración, historial/drift y ausencia de purgas en `specs/001-admin-community-media/validation/deployment-rehearsal.md`, sin aplicar despliegue compartido. Responsable: DB/coordinador. Dependencias: T061.
- [ ] T063 [P] Solicitar revisión independiente de capas, permisos, DTO, contratos, migraciones y evidencia en `specs/001-admin-community-media/validation/review.md`; reviewer de solo lectura devuelve hallazgos a owners, sin corregir ni integrar por su cuenta. Responsable: reviewer. Dependencias: T062.
- [ ] T064 [P] Solicitar revisión especializada de abuso administrativo, autoridad de datos, provisional tardío, evidencia/reporteros, uploads, referencias, secretos y fallos cerrados en `specs/001-admin-community-media/validation/security-review.md`, enlazando CHK001–CHK040 de `checklists/security.md`; los marcadores de esa checklist siguen bajo decisión de su revisor. Responsable: security. Dependencias: T062; en paralelo con T063 por informes distintos y solo lectura.
- [ ] T065 Resolver hallazgos T063–T064 con cada owner, añadir pruebas cuando un fallo nuevo lo justifique y repetir solo checks afectados más los obligatorios; actualizar evidencia y estados de tareas realmente completadas en `specs/001-admin-community-media/tasks.md`, sin convertir pendientes externos en aprobados. Responsable: coordinador/owners. Dependencias: T063–T064.
- [ ] T066 Consolidar criterios SC-001–009, trazabilidad FR-001–022, resultados/límites, destinos identificados sin secretos, ramas y SHA reales si se hicieron commits en `specs/001-admin-community-media/validation/delivery.md`; especificar que ninguna aprobación de requisitos certifica implementación y ningún mock prueba proveedor real. Responsable: coordinador. Dependencias: T065.
- [ ] T067 Preparar propuesta revisable en `specs/001-admin-community-media/validation/qa-proposal.md` con corte/recuperación y evidencias T061–T066; comprobar en `specs/001-admin-community-media/validation/frontend-contract.md` versión/SHA, resultados de los cuatro escenarios y aceptación explícita del responsable del consumidor. Si falta evidencia o aprobación, dejar este gate pendiente sin proponer habilitación del despliegue; una aprobación de QA no sustituye al consumidor. Con evidencias completas solicitar aprobación humana final antes de integrar a QA; sin merge/push-forzado/reset ni despliegue automático. Responsable: coordinador. Dependencias: T066.

### Registro de ejecución fase 7

- [X] T060 — Documentación de API, OpenAPI, Prisma y quickstart sincronizada con migraciones y contratos actuales.
- [X] T061 — Checks obligatorios ejecutados: 494 pruebas unitarias y 53 de integración en destinos desechables; resultados en `validation/final-checks.md`.
- [ ] T062 — Ensayo temporal desde cero y corte compatible de lector anterior ejecutados; faltan recuperación por fallo, backup/restauración y rollback operacional. Ver `validation/deployment-rehearsal.md`.
- [ ] T063–T064 — Revisión independiente y de seguridad pendiente: los agentes no iniciaron por límite temporal del entorno. Ver `validation/review.md` y `validation/security-review.md`.
- [ ] T065–T067 — Dependientes de revisiones externas, ensayo operacional y aceptación explícita del consumidor; propuesta QA queda PENDIENTE.

## Dependencies & Execution Order

### Dependencias de fases

```text
T001 → T002 → T003 → T004
                   ↓
T005 → [T006 | T007 | T008 → T009] → T010
                   ↓
  US1: T011–T022  (MVP de roles/asignaciones)
  US2: T023–T042  (sanciones y coordinación completa)
  US3: T043–T055  (imágenes y lectura aditiva)
  US4: T056–T059  (regresión de páginas finales)
                   ↓
T060 → T061 → T062 → [T063 | T064] → T065 → T066 → T067
```

La representación de historias no elimina dependencias puntuales de las líneas: las migraciones comparten `prisma/schema.prisma` y se serializan T013→T026→T046. Los contratos base y fixtures permiten probar US2 sin usar la UI/rutas de US1 y probar US3 sin activar sanciones. La secuencia de entregas de `src/app.ts`, docs/API.md y openapi.yaml es T020→T038→T053→T057→T060 por owner único; no ejecutarla en paralelo. El único owner media secuencia T019→T047→T049–T052 y los ajustes de T058.

US4 se puede preparar como regresión después de fundamentos, pero su aceptación completa necesita la composición de US3 (T055). No es dependencia funcional que obligue a crear cierre especial. US2 no se despliega parcialmente: rutas, filtros de lectura/acciones y reconciliación deben estar integrados antes de aceptar staging nuevo.

### Orden dentro de cada historia

Pruebas fallando por requisito ausente → schema/tipos/validaciones → repositorios → servicios → controllers/rutas → registro/contratos → ejecución real → revisión del incremento. Las correcciones compartidas respetan propietarios y transferencias explícitas. Nunca dos agentes editan schema o catálogo al mismo tiempo.

### Propiedad, ramas y aislamiento

| Responsable | Propiedad | Rama futura / aislamiento |
| --- | --- | --- |
| DB | prisma/schema.prisma, tres migraciones, tipos iniciales y repositories/user-locks.ts; entregar tipos antes de consumidores | agent/admin-community-media-db; ../wt-mf-db |
| Dev admin | auth/admin repository/service/controller/router, admin.schema y wrapper de validación | agent/admin-community-media-admin; ../wt-mf-admin |
| Dev community | sanciones, decisiones, community service/repos/models, cabecera y script | agent/admin-community-media-community; ../wt-mf-community |
| Media | catalog service/types/repos/controllers afectados, media receiver y media-paths; único dueño de locks de catálogo | agent/admin-community-media-media; ../wt-mf-media |
| Test | helpers/config/tests nuevos y evidencia de pruebas; tests existentes reservados por tarea antes de editar | agent/admin-community-media-test; ../wt-mf-test |
| Coordinador | app/auth router, API/OpenAPI, documentos de integración; revisar commits antes de integrar en feature | feature/admin-community-media; checkout propio revisado |
| Reviewer/security | Lectura e informes, sin cambios de código o integración | Sesiones de solo lectura |

Rama real al generar esta lista: dev. No se crean ramas/worktrees/commits con speckit-tasks. Si se trabaja sin delegación, seguir las mismas secuencias; si se delega, cada worker sabe que comparte proyecto, no revierte cambios ajenos y usa sesión/worktree independiente. No confundir un subagente en el mismo directorio con aislamiento.

## Parallel Examples

### US1

Tras T010, T011 (unitarias) y T012 (HTTP/SQL) pueden escribirse en paralelo en archivos distintos. Tras entregar T013–T018, el owner media trabaja T019; no se solapa su catálogo con US3. La ejecución real T021 espera el registro y contratos T020.

### US2

Tras T010, T023 (reglas/schemas), T024 (barreras SQL/Mongo) y T025 (HTTP) son paralelizables. T026 espera T013 y conserva owner DB. T028–T039 se secuencian por compartir repositorios/services; no se dividen artificialmente entre workers sobre el mismo archivo.

### US3

Tras T010, T043, T044 y T045 trabajan pruebas distintas; T048 puede preparar receiver/paths mientras DB secuencia T046, siempre en su propio worktree y sin ocupar catálogo. T049 espera tipos T047 y receiver T048. Las pruebas existentes de catálogo se reservan exclusivamente a T043 durante su escritura.

### US4

T056 puede escribirse junto a las pruebas de US3 porque tiene archivo propio y no altera catálogo. T057 comparte documentos del coordinador y espera T053; T058 espera US3 y su ejecución/correcciones se hace sin otro editor de catálogo concurrente.

## Implementation Strategy

### MVP primero

Completar fases 1–2 y US1 (T001–T022) entrega listado, cambios de rol y asignaciones auditadas. Demostrarlo con pruebas propias antes de ampliar a sanciones. No requiere nuevas dependencias ni borrar cuentas. Una demo local aceptada no sustituye aprobación de QA.

### Entrega incremental

Después, US2 como incremento completo y cerrado frente a fallos; US3 como cambio aditivo de imágenes; US4 como garantía de que el cierre editorial ordinario funciona con la nueva apertura. Las tareas de modelo compartido se serializan aunque las pruebas puedan prepararse antes. La aceptación global y propuesta de QA esperan fase 7.

### Estado y trazabilidad

| Historia / alcance | Tareas | Requisitos | Criterios |
| --- | --- | --- | --- |
| Setup/fundamentos | T001–T010 (10) | Constitución, contratos y entornos | Gates de plan |
| US1 | T011–T022 (12) | FR-001–005, FR-021 | SC-001–003, SC-008 |
| US2 | T023–T042 (20) | FR-006–012, FR-022 | SC-004, SC-009 |
| US3 | T043–T055 (13) | FR-013–016, FR-018–020 | SC-005–007 |
| US4 | T056–T059 (4) | FR-017 | Escenarios de historia 4, SC-005/007 |
| Cierre transversal | T060–T067 (8) | FR-001–022 y constitución | SC-001–009 |

Total: 67 tareas; 49 asociadas a historias y 18 compartidas/transversales. Todos los IDs incluyen archivo(s), responsable y dependencias. Los 40 ítems de seguridad son revisión de requisitos y mantienen su ciclo separado. Esta lista no afirma que pruebas, migraciones, revisión o integración hayan ocurrido.

Correcciones documentales aprobadas el 2026-10-29: C1/I1/U1/G1/G2/I2 integradas sin alterar IDs, número de tareas, marcadores de ejecución ni dependencias. La aceptación del consumidor se exige en T067; su recopilación pendiente no impide probar backend. Las futuras suites permanecerán aisladas y los casos nuevos quedan incluidos en US2.
