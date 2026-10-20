# Feature: Community

## Objetivo

Exponer API de comentarios, respuestas, edición, votos y reportes sobre la persistencia Community existente de dev actualizado, preservando sus invariantes.

## Estado actual

Base revisada f93c4c8 en feature/auth-community. Ya existen modelos Mongo Comment/CommentVote/CommentReport y repositorios con dependencias inyectables, validación imperativa, cursores estables, transacciones y borrado lógico. IDs Mongo son UUID string, no ObjectId. Comment almacena authorId, targetType WORK/CHAPTER, targetId, parentCommentId, rootCommentId, bodyMarkdown, status, revision y timestamps. Votes son documentos separados únicos por comentario/usuario con valor ±1; reports tienen reason/status y revisión de moderador.

SQL ya contiene User, Work y Chapter completos; no añadir modelos mínimos. Se inspeccionaron archivos exigidos por AGENTS y los repositorios/modelos Community, con package/scripts/config descritos en auth.md. No hay API de negocio Community aún. docs/API.md está desfasado frente al dominio recibido; actualizarlo antes del código bajo propietario coordinador.

## Alcance

Listar raíces/respuestas/thread mediante cursor; crear raíces y respuestas de cualquier profundidad admitida por repositorio; editar comentario propio con revisión optimista; borrado propio o ADMIN; establecer/retirar voto ±1; crear reportes; listar y resolver reportes sólo ADMIN. EDITOR no recibe moderación implícita. No uploads, isSpoiler/likes antiguos ni árboles recursivos completos. El usuario crea esquemas de validación; no nuevos Joi ni cambios validate.middleware.

## API

Contrato coordinado con API sobre repositorios existentes; coordinador lo refleja en docs/API.md antes de implementar:

| Método | Ruta | Auth / permisos | Entrada | Salida |
| --- | --- | --- | --- | --- |
| GET | `/api/comments` | Pública | Selector targetType+targetId, parentCommentId o rootCommentId; limit/cursor | CursorPage<Comment> |
| POST | `/api/comments` | ACTIVE | Raíz `{targetType,targetId,bodyMarkdown}` o respuesta `{parentCommentId,bodyMarkdown}` | 201 Comment |
| PATCH | `/api/comments/:id` | ACTIVE, autor | `{bodyMarkdown,expectedRevision}` | Comment |
| DELETE | `/api/comments/:id` | ACTIVE, autor o ADMIN | — | 204 |
| PUT | `/api/comments/:id/vote` | ACTIVE | `{value:-1|1}` | VoteSummary |
| DELETE | `/api/comments/:id/vote` | ACTIVE | — | 204 idempotente |
| POST | `/api/comments/:id/reports` | ACTIVE | `{reason,details?}` | 201 Report DTO seguro |
| GET | `/api/comment-reports` | ACTIVE ADMIN | status?, limit/cursor | CursorPage<Report> |
| PATCH | `/api/comment-reports/:id` | ACTIVE ADMIN | `{status:RESOLVED|DISMISSED,resolution}` | Report |

CursorPage `{items,hasMore,nextCursor}`. Cursor usa dos query strings `cursorCreatedAt` ISO y `cursorId` UUID, ambos o ninguno; convertir a `{createdAt: Date,id}` antes de repositorio. limit default20, rango1–100 actual. Orden ascendente createdAt/id, consulta limit+1. Selectores mutuamente excluyentes. No page/total ni expansión recursiva de replies. Lectura thread devuelve root y descendientes planos; respuestas devuelve hijos directos, también de respuestas anidadas.

Comment DTO transforma `_id` a id y fechas ISO: `{id,author:{id,username}|null,targetType,targetId,parentCommentId,rootCommentId,bodyMarkdown,status,revision,createdAt,editedAt,votes:{upvotes,downvotes,score}}`. No deletedById, authorId interno, email/hash/normalizados ni reportes en DTO público. Author se hidrata en lote con proyección SQL pública. El resumen interno incluye commentId para asociarlo; el DTO omite ese dato redundante y no muestra votantes. Report DTO público devuelve sólo el reporte creado; datos de moderación son exclusivos de ADMIN.

BodyMarkdown no vacío hasta10000 caracteres; expectedRevision entero>=0; UUIDs y enums existentes. Report reasons SPAM/HARASSMENT/HATE/SPOILER/OTHER; details/resolution hasta2000 caracteres. No aceptar authorId/moderatorId/reporterId/status de comentario proporcionados por cliente: derivar actor autenticado. Markdown se entrega como contenido, frontend debe renderizarlo con sanitización.

Errores: 400 invariantes/input; 401 sin identidad ACTIVE; 403 autor/rol insuficiente; 404 recurso ausente/inaccesible; 409 revisión obsoleta, duplicado o reporte ya cerrado; 500 seguro. No filtrar recursos DRAFT/deleted desde lectura pública.

## Pipeline de middlewares

GET comments → Controller → Service → repositorios. Mutaciones → authenticate ACTIVE → Controller → Service → repositorios. Moderación → authenticate → authorize ADMIN → Controller → Service con comprobación ADMIN → repositorios. Mantener verificación de permisos también en Service, dado que repositorios documentan que el caller es responsable de moderación. Sin schemas Joi nuevos. Routes sólo wiring; nunca consulta ni negocio.

Service comprueba target SQL publicado/no eliminado: WORK requiere Work PUBLISHED; CHAPTER requiere Chapter PUBLISHED y Work padre PUBLISHED/no eliminado. Respuesta hereda target/root del padre desde repositorio, sin que cliente pueda alterarlos; comprobar también visibilidad del target. Política de acceso a DRAFT por EDITOR/ADMIN debe ser explícita; por defecto comentarios públicos sólo sobre publicados.

## Persistencia

PostgreSQL es autoridad de usuario/estado/rol y existencia/publicación de target. Reutilizar schema y conexiones sin migración prevista. Mongo es autoridad de comentarios/votos/reportes; reutilizar modelos/índices existentes y repositorios, sin arrays de likes alternativos.

createReply/setVote/createReport usan transacción y touchActiveComment para serializar contra soft delete; esto incrementa revision también en actividad concurrente. Mantener semántica existente y documentar que expectedRevision puede quedar obsoleta por actividad, no sólo por edición. Las respuestas pueden anidarse; rootCommentId se hereda. Borrado mantiene nodos y descendientes, bodyMarkdown null/status DELETED y auditoría; no cascade delete. No editar/crear replies/votar/reportar sobre nodo no ACTIVE. Retirar voto ausente sucede y puede limpiar voto de comentario eliminado.

Transacciones requieren Mongo replica set y no tienen fallback standalone. No simular atomicidad con múltiples escrituras sueltas. SQL y Mongo no comparten transacción. Blob no interviene. Sin migraciones destructivas, reset ni modificación manual de Prisma generado. Recuperación: rollback de aplicación manteniendo colecciones/documentos/índices existentes.

## Contratos compartidos

- CommentRepository: createRoot/createReply/findById/listRoots/listReplies/listThread/editOwn/softDeleteOwn/softDeleteAsModerator con tipos existentes.
- CommentVoteRepository: setVote/removeVote/getSummary/getSummaries (máximo100 IDs en batch).
- CommentReportRepository: create/listForModeration/resolveAsModerator; sólo OPEN/IN_REVIEW pueden cerrarse.
- Catalog lookup SQL: destino publicado/vigente y pertenencia del capítulo a obra; nuevo repositorio propio DB, sin consultas Prisma en Service/Controller.
- AuthRepository devuelve identidad vigente y, si se usa author DTO, proyección pública batch.
- Cada capa operativa fuera routes tiene logger por módulo y try/catch con catchAndLogError. Adaptar wrappers persistenceOperation/communityTransaction preservando mapeos11000/validation y transacciones; no descartar la causa antes de log seguro. No cuerpos markdown, datos de reportes privados, credenciales ni drivers completos en logs.
- Mantener validación imperativa interna de repositorios; no sustituir por esquemas Joi del API que implementará el usuario.

## Tareas

### COMMUNITY-01
Responsable: db. Objetivo: reutilizar y adaptar observabilidad/persistencia sin cambiar invariantes.
Archivos propios: `src/repositories/community/`, `src/models/community/` sólo si corrección necesaria; repositorio SQL lookup y tipos acordados. No schema Prisma nuevo previsto.
Dependencias: base f93c4c8, contratos API consolidados y AUTH-01.
Contrato: métodos existentes anteriores, logger/catches seguros, cursor/UUID/revision conservados.
Validaciones: tipos/build; wrappers y transacciones; índices/votos únicos y conflictos de revisión con DB real si disponible.
Criterios: no reemplazar repos funcionales ni cliente generado; no like-array ni snapshots duplicados; llamadas públicas seguras y casos carrera preservados.

### COMMUNITY-02
Responsable: dev/coordinador. Objetivo: API y reglas/permisos.
Archivos propios: `src/services/community/`, `src/controllers/community/`, `src/routes/community.routes.ts`, docs/API.md/openapi.yaml y app.ts bajo único propietario compartido Auth.
Dependencias: COMMUNITY-01 y AUTH-02, contrato docs actualizado antes de código.
Contrato: nueve endpoints de tabla, DTO/cursor planos, política publicados y autor/ADMIN.
Validaciones: HTTP, permisos, cursores y errores; no nuevos Joi ni cambios validate.middleware.
Criterios: no consultas controller/routes; no privilegios del body; edición sólo propia y resolución sólo ADMIN; respuestas arbitrarias paginadas sin expansión ilimitada.

### COMMUNITY-03
Responsable: test; reviewer/security sólo lectura. Objetivo: comprobar comportamiento combinado y datos sensibles.
Archivos propios: harness/pruebas asignadas, sin cambiar implementación ajena.
Dependencias: COMMUNITY-01/02 y Auth terminados.
Contrato: HTTP y repos reales/dobles identificados.
Validaciones: escenarios siguientes, build, revisión de permisos y log/catch por capa.
Criterios: resultados reales inicial/final y separación clara de pruebas con dobles frente a transacciones/índices reales.

## Plan de pruebas

Raíz WORK/CHAPTER publicados; rechazo DRAFT/deleted e IDs inexistentes; reply a raíz y reply anidada conserva target/root; padre eliminado no permite creación; cursor estable con mismos timestamps, limit100/101 y cursor inválido; thread plano y consultas acotadas; editOwn correcto, autor ajeno y expectedRevision obsoleta; borrado autor/ADMIN y EDITOR ajeno403 conserva descendientes; votos +1 repetido idempotente, cambio a-1, remover ausente, unicidad concurrente; reportar reasons válidos, details largos, no filtrar terceros; moderación ADMIN versus BASIC/EDITOR; cierre RESOLVED/DISMISSED y segundo cierre409; transacciones versus borrado concurrente si replica disponible; error DB/log seguro; regresión Auth/health/CORS/404.

## Riesgos

Contrato anterior frontend incompatible: root/dev actualizan docs/API y señalan nuevas formas antes del código. Replica set necesario; no declarar integración transaccional con dobles. revision incrementa con touch de votos/replies/reports y puede producir409 frecuentes legítimos. SQL/Mongo tienen ventana de publicación/estado concurrente; no afirmar atomicidad distribuida. Autor público y datos privados de reportes deben separarse por DTO; markdown nunca interpretado como HTML seguro por defecto. Mantener stash de draft previo sin aplicarlo.

## Integración

Rama feature/auth-community sobre dev f93c4c8; agentes comparten directorio, un propietario por archivo y escrituras secuenciadas. Planner documentó, db adaptó repositorios, dev implementó API, test verificó y reviewer/security revisaron. Media se omitió porque no hay uploads. No se modificaron Prisma, migraciones ni modelos. No aprobación ni integración QA/main.

### Resultado verificado

- Community existente: 36/36 antes y después. Combinado inicial 83/84; final 84/84 sin omitidas. El fallo inicial fue timezone en Auth, corregido.
- Build, prisma:validate, tipos estrictos de todos los tests y git diff --check satisfactorios. OpenAPI válido y 77 referencias internas resueltas.
- HTTP local verifica nueve endpoints Community y tres Auth, permisos vigentes, envelopes y errores. Matriz y comandos en `tests/auth-community/README.md`.
- La regresión transaccional conserva MongoServerError y etiquetas dentro de withTransaction para permitir reintentos; sólo la frontera exterior sanitiza el fallo final. La sesión simulada verifica identidad y cierre, sin demostrar aislamiento o rollback reales.
- Reviewer/security sin bloqueantes. Integración con PostgreSQL/MongoDB replica set, índices efectivos y concurrencia real pendientes. No migraciones ni limpiezas ejecutadas.
- Por instrucción posterior del usuario se omiten más ejecuciones o ampliaciones de pruebas; se conservan los resultados ya obtenidos.

## Criterios de aceptación

1. API coherente con UUID/modelos/repos reales y docs/API actualizado, sin schema mínimo descartado.
2. Reutiliza raíces/replies/thread cursor, revision, transacciones, votos±1 y reportes existentes.
3. Usuario ACTIVE vigente; edición propia; delete autor/ADMIN; moderación sólo ADMIN y acceso sólo a targets publicados.
4. No nuevos Joi schemas ni cambios validate.middleware; logger/try/catch/catchAndLogError en capas operativas salvo routes.
5. Sin datos privados ni árboles ilimitados; pruebas y revisión documentadas con límites reales.

