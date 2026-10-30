# Feature: Fase 4 — sanciones y creación segura de comentarios

## Objetivo

Implementar US2 (T023–T042): permitir que un ADMIN activo imponga y revoque restricciones de creación a usuarios BASIC/EDITOR, y coordinar la publicación de comentarios entre PostgreSQL y MongoDB de modo que una sanción confirmada bloquee toda creación todavía pendiente. Un comentario nuevo solo es utilizable cuando su contenido fue escrito durablemente en MongoDB y su decisión SQL quedó `COMMITTED`.

## Estado actual

- `CommunityService.create` escribe directamente en MongoDB, sin barrera SQL ni recuperación idempotente.
- Las lecturas y mutaciones confían solo en MongoDB y todavía no exigen una decisión de publicación.
- Prisma no contiene `CommentSanction` ni `CommentCreationDecision`.
- Los contratos base de sanciones y creación deben alinearse con el schema definitivo.

## Alcance

Incluye sanción temporal/permanente, revocación idempotente por UUID, cierre perezoso, evidencia opcional, vista propia privada, auditoría, protocolo prepare–stage–finalize, replay, accesibilidad centralizada y reconciliación acotada. Incluye migración aditiva, pruebas reales, documentación y evidencias T040–T042.

Quedan fuera UI, cron, purga de provisionales, almacenamiento de Markdown en SQL, snapshots de evidencia y transacciones distribuidas. Blob no participa.

## API

| Método y ruta | Autorización | Entrada | Resultado |
| --- | --- | --- | --- |
| `GET /api/admin/users/:userId/comment-sanctions` | ADMIN | UUID y cursor | sanción actual e historial |
| `POST /api/admin/users/:userId/comment-sanctions` | ADMIN | motivo, fin, evidencia opcional | sanción / 201 |
| `PUT /api/admin/users/:userId/comment-sanctions/:sanctionId/revocation` | ADMIN | cuerpo vacío | sanción / 200 |
| `GET /api/auth/me/comment-restriction` | autenticado | identidad de sesión | restricción privada |
| `POST /api/comments` | autenticado | body e `Idempotency-Key` UUID opcional | comentario / 201 tras `COMMITTED` |

La misma clave, autor y huella reproduce el resultado; una huella distinta da 409. Los marcados sin decisión `COMMITTED` se ocultan; una dependencia SQL necesaria que no responde da 503.

## Pipeline de middlewares

- Administración: `authenticate → authorize ADMIN → Joi estricto → controller → service → repositories`.
- Vista propia: `authenticate → controller → sanction service → SQL repository`.
- Creación: `authenticate → validateBody → controller → SQL prepare → Mongo stage durable → SQL finalize`.
- Lectura: controller → service → candidatos Mongo acotados → una consulta SQL en lote → DTO.

## Persistencia

PostgreSQL es fuente de verdad de identidad, sanción y permiso de publicación. `CommentSanction` cubre vigencia, cierre, revocación y referencia mínima de evidencia. `CommentCreationDecision.id` es UUID de operación/comentario y guarda autor, estado, SHA-256 canónico, ventana de 60 segundos, decisión y rechazo; nunca Markdown o snapshots.

MongoDB es fuente de verdad de contenido, destino, árbol y revisiones. Todo documento nuevo lleva `creationOperationId` inmutable, UUID e igual a `_id`. Solo la ausencia estricta identifica legado; null, formato inválido o desigualdad se ocultan.

`prepare` abre 60 segundos según reloj SQL. Mongo hace staging con majority y recuperación primary/majority. `finalize` recibe el destino derivado del documento verificado, toma locks User→Work y revalida cuenta, sanción y catálogo. Una retirada ganadora persiste `REJECTED/TARGET_UNAVAILABLE`; el Service responde 404 después del commit. No hay red Mongo dentro de SQL.

Imponer una sanción bloquea actor/destinatario, obtiene hora SQL después del lock, cierra vencida, audita y rechaza todas las `PREPARED` atómicamente. Revocar opera sobre el UUID concreto. La migración solo se prueba en PostgreSQL desechable.

El despliegue requiere drenar writers antiguos y activar juntos writer y lectores adaptados. No se vuelve a una versión que desconozca el marcador.

## Contratos compartidos

- `SanctionDto` y `RestrictionDto` no exponen actor/evidencia/historial en la vista propia.
- Los resultados de decisión son tipados; `TARGET_UNAVAILABLE` se devuelve después de confirmar SQL.
- Huella SHA-256: autor + variante raíz/respuesta + target o parent + Markdown canónico.
- `findAccessibleById`/`filterAccessibleBatch`: legado solo si falta el marcador; marcado solo con decisión del mismo ID/autor `COMMITTED`.
- Listas inspeccionan `limit+1`, consultan SQL una vez y avanzan por el último candidato examinado; una confirmación tardía detrás del cursor aparece al refrescar desde la primera página.

## Propiedad, ramas y orden

| Propietario | Rama / worktree | Archivos exclusivos |
| --- | --- | --- |
| Test | `agent/admin-community-media-phase4-test` / `../wt-mf-phase4-test` | T023–T025 y tests US2 |
| DB | `agent/admin-community-media-phase4-db` / `../wt-mf-phase4-db` | schema, migración, tipos, Joi y repositorios SQL T026–T029 |
| Dev Mongo | `agent/admin-community-media-phase4-mongo` / `../wt-mf-phase4-mongo` | modelos/repositorios Mongo T030–T032 y repositories T035 |
| Dev API | `agent/admin-community-media-phase4-api` / `../wt-mf-phase4-api` | services/controllers/routes/script T033–T039 |
| Coordinador | rama feature | app, auth route, docs, evidencias, integración y `tasks.md` |
| Reviewer/Security | solo lectura | T042 |

DB entrega contratos y repositorios SQL antes de Mongo/API. `community.service.ts` pertenece a Dev API; comment/vote/report repositories pertenecen a Dev Mongo. Test no modifica producción.

## Tareas

### P4-01 — T023–T025: tests primero

Responsable: Test. Escribir los cinco archivos indicados en `tasks.md` para Joi/DTO, HTTP y barreras SQL+Mongo. Deben cubrir raíz/respuesta, timeout, write tardío, crash, replay, expiry, retiro de targets, 403 sin logout, 503 fail-closed y cursor que avanza.

### P4-02 — T026–T027: modelos y contratos

Responsable: DB. Añadir tablas, enum, FK, CHECK e índices exhaustivos; alinear tipos y Joi sin campos derivados. Validar con Prisma y migración en base desechable; NULL no puede eludir CHECK.

### P4-03 — T028–T029: repositorios SQL

Responsable: DB. Implementar locks UUID User→Work, reloj SQL posterior, sanción/auditoría/rechazo atómicos y prepare/replay/finalize/CAS/batch/rejectExpired sin red externa. Las terminales no cambian y la ventana no se amplía.

### P4-04 — T030–T032: staging Mongo durable

Responsable: Dev Mongo. Implementar marcador inmutable, stage idempotente majority, recuperación canónica y reply transaccional con padre. No sobrescribir, duplicar efectos, usar `Promise.all` en sesión ni fallback standalone.

### P4-05 — T033–T034: coordinación de creación

Responsable: Dev API. Coordinar prepare→stage→finalize, fingerprint, clave opcional y stagedTarget verificado. Solo responder 201 con `COMMITTED`; soportar 403/404/409/503 estables.

### P4-06 — T035: accesibilidad total

Responsables: Dev Mongo en repositories y Dev API en service. Todo camino de id/list/root/reply/thread/parent/edit/delete/vote/report/evidencia filtra decisión. Una consulta SQL por página, `limit+1`, cursor del último examinado y fail-closed.

### P4-07 — T036–T037: sanciones y HTTP

Responsable: Dev API. Validar evidencia y autor, impedir ADMIN y operaciones propias inválidas, no copiar texto/reportero y limitar vista propia. Routes solo ordenan middleware; controllers extraen; services coordinan.

### P4-08 — T038: montaje y documentación

Responsable: Coordinador. Montar router, exponer vista propia y documentar privacidad, replay, 403, 503 y cursores sin alterar envelopes.

### P4-09 — T039: reconciliación

Responsable: Dev API. Script inspect por defecto y `--apply` explícito, máximo 100, solo `PREPARED` vencidas bajo lock → `REJECTED/EXPIRED`. Nunca confirma ni borra Mongo; logs sin contenido sensible.

### P4-10 — T040–T041: proveedores reales

Responsables: Test/DB y Coordinador para evidencia. Ejecutar PostgreSQL desechable y Mongo replica set real, matrices CHECK, carreras, destino retirado, cursor y marcador estricto. Registrar comandos y resultados reales en `validation/us2*.md`.

### P4-11 — T042: revisión independiente

Responsables: Reviewer y Security. Revisar FR-006–012/022, SC-004/009, privacidad, logs, auth, locks, migración, protocolo y corte. Máximo dos rondas; cero hallazgos críticos/altos abiertos.

## Plan de pruebas

- Unitarias: Joi/DTO, motivo/fechas, ADMIN, evidencia, privacidad, fingerprint, replay y expiración exacta.
- HTTP: auth/roles/orden, envelopes, sanción/vista propia, clave, 403, 404 oculto, 409 y 503.
- PostgreSQL real: migración, FK/CHECK/NULL, único parcial, auditoría, cierre/revocación, reloj/locks y estados terminales.
- Mongo replica set real: majority, duplicate/timeout/write tardío, recuperación y padre.
- Combinadas: sanción vs decisión, crash, SQL incierto, replay tras expiración, retiro en ambos órdenes, caminos ocultos y refresco.
- Regresión: auth, community, catalog, reading y discovery.

## Riesgos

- Despliegue mixto: mitigado con migración aditiva, drenaje y corte coordinado.
- Timeout/duplicate confundido con durabilidad: recuperación primary/majority y comparación canónica.
- Locks divergentes con catálogo: orden User UUID asc → Work UUID asc y mismo lock de Work.
- N+1/cursor estancado: lote único, `limit+1` y cursor del último examinado.
- Acumulación provisional: reconciliación acotada; purga queda fuera.

## Integración

Integrar P4-01 → P4-02/P4-03 → P4-04 → P4-05/P4-06/P4-07/P4-09 → P4-08 → P4-10. Cada entrega informa rama, SHA, archivos, comandos y riesgos. No hay push forzado, merge a main/QA ni migración compartida. Tras P4-11, publicar la rama y abrir PR a `dev`; QA requiere aprobación humana.

## Criterios de aceptación

- ADMIN activo impone/revoca a BASIC/EDITOR; no a ADMIN ni autosanción inválida.
- Sanción ganadora rechaza atómicamente preparaciones; staging tardío nunca es accesible.
- Una decisión terminal nunca se resucita ni reescribe.
- Ningún comentario nuevo se usa sin documento durable y decisión `COMMITTED` consistente.
- Todos los caminos ocultan provisional/rechazado/inconsistente; caída SQL devuelve 503.
- Retiro ganador persiste `TARGET_UNAVAILABLE` y responde 404.
- Replay igual reproduce; solicitud distinta da 409; incertidumbre da 503.
- Vista propia y evidencia preservan privacidad; SQL no guarda Markdown.
- Tests reales, build, Prisma y revisión quedan registrados.
