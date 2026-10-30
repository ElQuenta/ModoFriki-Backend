# Implementation Plan: Administración segura, sanciones e imágenes

**Branch**: `dev` (checkout real, sin rama nueva ni commit) | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature `001-admin-community-media`. Spec Kit devuelve ese identificador como BRANCH por su selector; no significa que Git haya cambiado desde `dev`.

## Summary

Integrar usuarios y asignaciones exclusivas de ADMIN, sanciones para BASIC/EDITOR y una tercera imagen por obra conservando capas, conexiones, handlers y pipeline existentes. La primera publicación exige tres imágenes salvo exención histórica capturada durante el despliegue. Añadir `readingImages` sin modificar `pages`; el cierre sigue siendo una página normal.

La garantía de sancionar envíos pendientes requiere una decisión durable de autorización en PostgreSQL, después de preparar contenido provisional en MongoDB. SQL no guarda texto de comentarios. Las consultas y acciones filtran decisiones de publicación de comentarios nuevos. Diseño: [research.md](research.md), [data-model.md](data-model.md), [HTTP](contracts/http-api.md) y [protocolo](contracts/persistence.md).

## Technical Context

**Language/Version**: TypeScript 7.0.2, strict, ES2022/NodeNext; Node local observado v24.22.0. Mantener runtime del proyecto y verificar compatibilidad en CI/despliegue, sin actualizarlo por esta feature.

**Primary Dependencies**: Lockfile: Express 5.3.0, Prisma/client/adapter-pg 7.10.1, pg 8.23.1, Mongoose 9.11.2, Joi 18.3.0, Multer 2.4.0, Vercel Blob 2.8.2, Vitest 3.2.4, YAML 2.9.1. Reutilizar JWT, bcrypt, Winston y safe-stable-stringify. Node crypto, http y fetch cubren UUID, huellas y pruebas HTTP.

**New dependencies**: Ninguna necesaria. No instalar paquetes para elaborar el plan, ni añadir sharp, Redis, BullMQ, Supertest o Testcontainers por defecto. Si la implementación demuestra una necesidad no cubierta, registrar justificación y versión, incorporar package/lockfile y validar; el usuario autoriza esa incorporación justificada, no una actualización general.

**Storage**: PostgreSQL: identidad, permisos, sanciones, decisiones de autorización, auditoría y catálogo. MongoDB replica set: contenido/hilos/votos/reportes. Blob: bytes públicos. Reutilizar `src/config/database/`, sin otro pool. Versiones de servidores desplegados no comprobadas: preflight verifica compatibilidad del destino, no la presume.

**Testing**: Vitest existente, fixtures por inyección, HTTP con servidor efímero y fetch; proveedores desechables externos mediante clientes instalados. Añadir configuración de integración separada: vitest.config.ts actual fuerza URLs ficticias y no debe redirigirse silenciosamente a bases reales.

Separación requerida en implementación: vitest.config.ts excluye `**/*.integration.test.ts` conservando exclusiones predeterminadas y variables ficticias; vitest.integration.config.ts incluye únicamente `src/**/__tests__/**/*.integration.test.ts` y exige destinos TEST_* explícitos. Documentar los inventarios de ambas suites, cuya intersección debe ser vacía; npm test no requiere ni importa fixtures de proveedores reales. La configuración ejecutable todavía no se modifica con esta corrección documental.

**Target Platform / Project Type**: Backend Express Node existente; frontend en otro repositorio. Esta entrega planifica, no implementa ni despliega.

**Performance Goals**: Sin SLA nuevo inventado. Nuevas listas limit=20 por defecto/100 máximo, índices y orden estable. Comunidad: decisiones SQL en lote, no N+1; examinar como máximo limit+1 candidatos Mongo y avanzar cursor por el último examinado. Puede haber página vacía con hasMore=true. Medir con fixtures de 10 000 cuentas/decisiones, revisar planes de consultas y comparar baseline; no afirmar medidas no ejecutadas.

La paginación de comentarios no es instantánea: una decisión confirmada después de pasar su posición se descubre al reiniciar desde la primera página, sustituyendo la colección local. Mantener orden/campos actuales y límites, sin añadir polling obligatorio o fecha de publicación nueva.

**Constraints**: 10 MiB/imagen, 100 MiB/petición, tres archivos individuales de obra, 100 páginas/petición, 1000/capítulo. Transacciones SQL cortas sin red Mongo/Blob dentro. Sin transacción distribuida, limpieza periódica de Blob o purga de historial. Identidad vigente y fail-closed.

**Scale/Scope**: Cuatro historias, FR-001–022 y SC-001–009; sin UI, nuevos ADMIN, borrado de usuarios ni cambios de permisos heredados de eliminación de catálogo. No crear tasks.md en esta fase.

## Constitution Check

Gates evaluados antes de investigación y otra vez después del diseño:

| Gate | Antes | Después / evidencia |
| --- | --- | --- |
| I. Valor y alcance | PASS | Historias de administración, moderación y lectura; sin monetización. |
| II. Evolución incremental | PASS | package/tsconfig, schema/config, database/env, app/index, rutas, handlers, middlewares y utilidades inspeccionados; reutilización de paquetes. |
| III. Capas | PASS | Rutas ordenan middleware, controllers extraen/responden, services coordinan, repositories persisten; Blob solo middleware. |
| IV. Identidad vigente | PASS | ADMIN activo; destinatarios ACTIVE/SUSPENDED; ADMIN protegido; locks coordinados con catálogo. |
| V. Autoridad/historial | PASS | SQL solo permiso/decisión sin cuerpo de comentario; Mongo conserva contenido. Auditoría atómica y fallos parciales explícitos. |
| VI. Multimedia | PASS | Tres campos sobre pipeline actual, journal conservado; workBanners se verifica antes de borrar páginas sustituidas. |
| VII. Lectura | PASS | GET sin actividad; apertura no renumera ni cuenta como página; consultas acotadas. |
| VIII. Comunidad | PASS | Raíces/respuestas y acciones filtran decisiones; hilos, borrado lógico y privacidad preservados. |
| IX. Contratos/evidencia | PASS | Contratos aditivos, handlers actuales, pruebas reales exigidas; no se confunde diseño con validación ejecutada. |
| Migraciones/Git | PASS | Aditivas revisables; sin reset/db push/migrate dev compartido; sin commits main/QA; aprobación humana antes de QA. |

PASS describe conformidad del diseño, no del despliegue. Si la prueba real del protocolo falla, se bloquea aceptación de FR-007: no sustituirlo por middleware solamente.

## Project Structure

### Documentation (this feature)

```text
specs/001-admin-community-media/
├── spec.md
├── clarification-review.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── http-api.md
    └── persistence.md
```

### Source Code (repository root)

Archivos nuevos se crean durante implementación:

```text
prisma/schema.prisma + prisma/migrations/<migracion-aditiva>/migration.sql
src/types/{admin,sanctions,comment-creation,catalog}.types.ts
src/routes/{admin,comment-sanctions,auth,catalog,community}.routes.ts
src/controllers/auth/admin.controller.ts
src/controllers/community/comment-sanctions.controller.ts
src/services/auth/admin.service.ts
src/services/community/{comment-sanctions,comment-creation,community}.service.ts
src/repositories/auth/admin.repository.ts
src/repositories/user-locks.ts
src/repositories/community/{comment-sanction,comment-creation,comment,comment-vote,comment-report}.repository.ts
src/repositories/community/community.persistence.ts
src/models/community/{comment.model,community.types}.ts
src/repositories/catalog/{catalog.persistence,work.repository,chapter.repository,media.repository}.ts
src/middlewares/admin-validation.middleware.ts
src/middlewares/schemas/{admin,comment-sanctions}.schema.ts
src/middlewares/media/receive.middleware.ts
src/services/catalog/catalog.service.ts
src/utils/media-paths.ts
src/scripts/reconcile-comment-creations.ts
src/app.ts
src/**/__tests__/*.test.ts + vitest.integration.config.ts
docs/API.md + openapi.yaml
```

**Structure Decision**: Mantener dominios y capas. Cuentas bajo auth, sanciones/coordinación bajo community. Rutas de sanciones separadas del router de roles; tipos compartidos explícitos y factories/inyección. No cambiar framework ni conexiones.

## Diseño de integración

### Estado actual

Auth solo carga ACTIVE: el destinatario administrativo SUSPENDED requiere proyección propia. authorize existe; asignaciones/auditoría no tienen endpoints. CommunityService.create concentra raíz/respuesta. validateQuery elimina desconocidos; nuevas rutas usan Joi estricto stripUnknown:false sin alterar las anteriores. Catálogo toma lockWork antes de reautorizar: normalizar orden de locks para revocación/degradación concurrente. Solo hay cover/inpagecover y detalle pages sin apertura. claimReplacedChapterAssets debe contar la nueva inversa workBanners.

### API y pipeline

Contrato: [HTTP](contracts/http-api.md). Administración: authenticate → authorize ADMIN → validación estricta params/query/body → controller → service → repository. Consulta propia: identidad de sesión, nunca userId arbitrario. Guard HTTP y revalidación transaccional complementarios.

Uploads: authenticate → catalogPreflight → receiver Multer → Joi → validateImages → uploadMedia → controller → service → repository → deleteReplacedChapterMedia → respondSaved. Preflight antes de Multer; prepare calcula referencias efectivas y falla antes de Blob si publicación incompleta; commit revalida. Cambiar máximo 2→3 en receiver, service, allowed fields, paths y persistencia conjuntamente.

### Persistencia y contratos compartidos

[Modelo](data-model.md) y [protocolo](contracts/persistence.md): nuevas CommentSanction/CommentCreationDecision, versión de asignación, auditoría extendida, banner y exención interna de Work. Mongo añade creationOperationId opcional e inmutable. El guardado aceptado se decide en SQL tras staging Mongo durable, serializado con sanciones; todo acceso a nuevos comentarios requiere decisión COMMITTED. No copiar texto ni restricción a otra autoridad.

Finalizar exige stagedTarget obtenido del contenido Mongo durable, locks User→Work y revalidación SQL de publicación/baja/pertenencia de obra/capítulo, coordinada con catálogo. Retirada ganadora confirma REJECTED/TARGET_UNAVAILABLE; el Service responde 404 solo después de persistir esa decisión. Una decisión ya terminal no se reescribe en replay. Las tablas de estados y cierre de sanción del modelo sustituyen expresiones abiertas como «coherente».

Orden de locks: User UUID asc → Work UUID asc → relaciones/decisiones. No Work→User. Aplicarlo a reservas, guardados, bajas y journal afectados. Las subidas pueden terminar después de revocar un permiso, pero no confirmar sus referencias. No mantener transacciones SQL mientras se espera Mongo/Blob.

### Migración y puesta en servicio

1. Preparar migración offline y probarla en destinos desechables preservando FK/CHECK/índices. No aplicar a bases configuradas en esta sesión.
2. Preflight autorizado: destino, versiones, historial/drift, respaldo restaurable y ventana de corte. README menciona baseline existing_example ausente localmente: reconciliar el historial real antes de aplicar, sin inventar ni marcar migraciones para ocultar drift.
3. Detener y drenar todos los writers antiguos, incluidos jobs/scripts de comentarios y publicación. No despliegue mixto: saltarían decisiones y requisito de imágenes.
4. Capturar exención fija desde publishedAt acreditado, incluidas obras hoy DRAFT. PUBLISHED sin fecha acreditada exige reconciliación, no eximir por createdAt.
5. Aplicar migración revisada, índices Mongo y aplicación con TODOS los accesos adaptados; smoke y habilitar tráfico. Frontend adopta readingImages sin duplicar apertura y mantiene posiciones editoriales.
6. Rollback solo a versión compatible con decisiones; no volver a lectores/writers viejos. Mantener esquema aditivo y corregir hacia adelante; no borrar tablas/eventos/Blob.

Antes de habilitar tráfico, exigir validation/frontend-contract.md con repositorio/versión o SHA del consumidor, responsable, fecha, entorno, evidencia de escenarios y aceptación explícita. Debe cubrir página vacía con hasMore, refresco tras confirmación tardía, readingImages sin duplicados y progreso editorial conservado. Si depende de un equipo externo sin respuesta/acceso, registrar pendiente y bloquear despliegue; documentación o aprobación de QA por sí solas no reemplazan esa aceptación. No enviar comunicaciones externas sin autorización.

## Trabajo secuenciado, responsables y dependencias

Unidades para speckit-tasks; no checklist de ejecución. Investigadores actuales: solo lectura en dev, sin worktrees/commits. Futuros implementadores: rama feature/admin-community-media desde base revisada y sesiones/worktrees ../wt-mf-{db,admin,community,media,test}, ramas agent/admin-community-media-{db,admin,community,media,test}. No crearlas ahora. Reviewer/security solo lectura.

| Unidad / propietario | Archivos propios y resultado | Dependencia | Aceptación |
| --- | --- | --- | --- |
| P0 / coordinador + DB | Contratos documentales y preflight de historial del destino autorizado | Ninguna | Gates y protocolo sin preguntas de producto pendientes. |
| P1 / DB | schema, migración, types admin/sanctions/comment-creation, helper repositories/user-locks.ts y contratos; version y createdAt estable de asignaciones con backfill desde assignedAt | P0 | FK/CHECK/índices, cursor inmutable, exención y output generado; validate/generate e integración. |
| P2 / dev admin | admin repository/service/controller/router, admin.schema, wrapper estricto | P1 | Rol/CAS, asignaciones versionadas y auditoría; ACTIVE/SUSPENDED; ADMIN protegido. |
| P3 / dev community | Sanciones/decisiones, services y repositories/models community, script reconciliación | P1 | Pendientes ocultos en todos los caminos; evidencia, fallos y carreras reales. |
| P4 / dev media | catalog service/types/repos, receiver y media-paths, locks de catálogo | P1 y acuerdo P2/P3 | Tres imágenes, exención, readingImages, referencias seguras; sin cambiar permisos de eliminación. |
| P5 / coordinador | app.ts, routes/auth.routes.ts, API.md, openapi.yaml e integración revisada | P2–P4 | Rutas únicas y consumidor/documentación compatibles. |
| P6 / test | Tests nuevos propios y config integración; tests existentes secuenciados con dueño | Interfaces P1; aceptación tras P5 | Unitarias, HTTP, proveedores y fallos inyectados con evidencia. |
| P7 / reviewer + security | Informe solo lectura | P6 | Auth, privacidad, permisos, uploads, migración y protocolo revisados. |
| P8 / coordinador | Propuesta de integración y evidencia | P7/checks conformes | Aprobación humana antes de QA; sin force-push/reset ajeno. |

DB entrega schema/types antes de consumidores; media es único dueño de repos catalog/orden de locks; community de community.persistence; coordinador de app/auth router/OpenAPI. Test no toca implementación; cambios de tests existentes se secuencian con dueño. Cada entrega informa rama/SHA reales, archivos, checks y pendientes. Ningún worker integra a QA/main.

## Plan de pruebas y criterios de aceptación

- Unitarias: matriz BASIC↔EDITOR × ACTIVE/SUSPENDED; no-op/stale, frontera exacta de sanción; evidencia opcional/ajena; privacidad; N/N+1 y páginas iguales; campos/formatos/límites y temporales.
- HTTP Node+fetch: guards antes de recepción/subida, desconocidos Joi, 401/403, envelopes, cursores, CAS y revocación vieja. Sin nueva biblioteca HTTP.
- SQL real: migración fixtures existentes, exenciones históricas, FK/CHECK, unicidad de sanción abierta, cierre vencida bajo lock, auditoría atómica y carreras de asignación/degradación.
- SQL + Mongo replica set: barreras para escritura tardía, commit incierto y muerte entre pasos; sanción ganadora, decisión ganadora, fin/revocación sin resucitar REJECTED; filtrado raíz/respuesta/thread/id/edit/delete/vote/report/evidencia; cursor vacío que avanza.
- Cubrir despublicación/baja concurrente de obra, capítulo y obra padre en ambos órdenes frente a finalize, con rechazo durable y 404 cuando gana la retirada; y provisional aceptado detrás del cursor que aparece al refrescar desde el inicio. Comprobar combinaciones de estados/fechas/códigos válidas e inválidas definidas en el modelo.
- Blob de prueba: tercer banner, journal y fallos después de subir; conservar abandonados/banners; borrar páginas sustituidas solo sin referencias, incluida workBanners.
- Regresión: suites auth/community/catalog/reading/discovery, borradores/publicados, métricas y progreso sin efectos de GET.

Trazabilidad: FR-001–005/021 → P2/P4, SC-001–003/008; FR-006–012/022 → P3, SC-004/009; FR-013–020 → P4/P5, SC-005–007. Aceptación requiere todos los SC, checks y revisión, no solo compilar. Guía: [quickstart.md](quickstart.md).

## Riesgos y recuperación

CHK037, revisión de requisitos 2026-10-30: quedan fuera la protección general contra abuso, rate limiting y cuotas acumulativas por usuario/globales. Los límites por petición/consulta y el plazo lógico de preparación de 60s no acotan la acumulación de decisiones SQL, provisionales Mongo ni archivos Blob conservados. No se promete protección frente a denegación de servicio o agotamiento de almacenamiento; no se añaden purgas, workers ni garantías operativas. El coordinador conserva este riesgo en validation/requirements-review.md para seguimiento separado; cualquier control futuro requiere alcance y validación propios.

Más consultas SQL y provisionales Mongo: batch/índices y fail-closed, sin N+1 o purga automática. Protocolo entre proveedores necesita prueba real antes de aceptación. Rollback viejo inseguro tras corte. Historial real no probado por archivos locales. Adaptación de frontend se entrega como contrato, no se afirma editar otro repo. Blob público no da privacidad de borradores. Un fallo de estos controles bloquea desplegar sanciones como si estuvieran garantizadas.

## Complexity Tracking

Sin excepciones constitucionales. El journal SQL representa decisiones de permiso, no comentarios ni una copia de sanciones Mongo. Precheck o lock alrededor de Mongo no cubren timeout/crash con write tardío; por ello se justifica esta complejidad y se exige prueba.

## Estado de entrega

Solo diseño documental. Sin modificaciones de dependencias, aplicación o proveedores; sin pruebas de implementación/migraciones ejecutadas. Rama Git dev, sin commit/merge/QA. Las tareas están generadas en [tasks.md](tasks.md). La siguiente fase es speckit-implement, comenzando por los controles T001–T004.

Revisión de planificación por planner, DB y media de solo lectura: corregidos createdAt de asignación/backfill/índice, recuperación durable de staging primary/majority, semántica de borrado de padre, cursor no opaco y preservación de timeout de 30s de capítulos. El coordinador verifica enlaces locales, fences, ausencia de marcadores de plantilla, coherencia de decisiones y git diff --check. Estas verificaciones documentales no acreditan la futura implementación.

Correcciones documentales C1/I1/U1/G1/G2/I2 aprobadas y aplicadas el 2026-10-29. Revalidación de destino, aislamiento de suites, tablas de estados, política de refresco y gate de consumidor quedan trazados en tasks.md. No se han ejecutado sus futuras pruebas ni cambiado configuración de aplicación/proveedores.

Avance 2026-10-30: revisión de requisitos 40/40 tras aclarar CHK037 y fase 1 T001–T004 completadas documentalmente en [validation/preflight.md](validation/preflight.md), [requirements-review.md](validation/requirements-review.md), [ownership.md](validation/ownership.md) y [test-environments.md](validation/test-environments.md). Rama actual `feature/admin-community-media`, creada desde `dev`, sin commits nuevos. Los metadatos iniciales describen la planificación anterior. Fases 2–7, pruebas de aplicación/proveedores y gates de consumidor/despliegue siguen pendientes.

Avance posterior 2026-10-30: fase 2 T005–T010 implementada en `feature/admin-community-media-phase-2` desde `dev` tras merge del PR #7. [validation/foundation.md](validation/foundation.md) registra contratos, locks, validación, helpers, separación de suites, revisión y resultados reales. Fases 3–7 y pruebas de proveedores/carreras siguen pendientes; la aprobación de fundamentos no acredita las historias administrativas o de sanciones.
