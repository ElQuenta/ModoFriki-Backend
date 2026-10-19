# Feature: base de persistencia y comunidad en MongoDB

## Objetivo

Actualizar la propuesta y materializar sus estructuras de datos: núcleo relacional en Prisma/PostgreSQL y comunidad en modelos/repositorios Mongoose. Preparar cambios revisables y publicarlos mediante push de la rama feature solicitada por el usuario. El push de Git no equivale a aplicar esquemas a bases remotas.

Propuesta funcional completa: [MODELO_DATOS_PROPUESTO.md](MODELO_DATOS_PROPUESTO.md).

## Estado actual

Inspeccionados `AGENTS.md`, `docs/agents/WORKFLOW.md`, plantilla de features, `package.json`, `tsconfig.json`, `prisma/schema.prisma`, `prisma.config.ts`, `src/config/database/*`, `src/config/env.ts`, `src/app.ts`, `src/index.ts`, handlers, middleware HTTP y utilidades.

Al iniciar esta etapa Prisma solo contiene `Example`, con PK entera. El cliente usa `prisma-client`, generado en `src/generated/prisma`, adaptador PostgreSQL y URL desde `prisma.config.ts`. Mongoose ya está conectado mediante la configuración existente. No hay modelos de dominio ni repositorios. La única ruta registrada es `GET /health`.

TypeScript es estricto, ES2022/NodeNext. Dependencias existentes suficientes: Prisma, Mongoose, Joi y `tsx`. Scripts disponibles: `build`, `dev`, `start`, `prestart`, `prisma:generate`, `prisma:validate`, `prisma:migrate`, `prisma:studio`. No hay scripts `test` ni `lint`; no inventar su ejecución. No se inspeccionan ni modifican secretos del `.env`.

## Alcance

Incluido:

- Actualizar la distribución de datos y eliminar afirmaciones obsoletas de comunidad SQL o MongoDB opcional.
- Modelos Prisma para usuarios, asignaciones, auditoría, catálogo, capítulos, medios, biblioteca, valoraciones, lectura/visitas y seguimiento de uploads/limpieza.
- Conservar `Example`; generar migraciones SQL revisables sin ejecutar operaciones contra las bases conectadas.
- Modelos Mongoose `Comment`, `CommentVote`, `CommentReport`; repositorios de comunidad con UUID, validaciones, paginación por cursor, filtros explícitos y transacciones locales MongoDB.
- Pruebas pertinentes con `node:test` y `tsx` existente; build y validación Prisma; revisión independiente antes del commit/push coordinado.

Fuera de esta etapa: endpoints, autenticación, controllers/services, repositorios SQL de negocio, renderer Markdown, middleware Blob, workers de cleanup, calendario/estadísticas HTTP y despliegue de migraciones/índices a bases remotas. Las estructuras preparan esas funciones; no se entregan como funcionalidades operativas.

## API

Método/ruta: no se agregan endpoints. `/health` conserva su contrato actual.

Autenticación y autorización futuras: visitante solo consulta contenido publicado; registrado interactúa con comunidad y biblioteca; editor opera capítulos de obras asignadas; administrador gestiona obras, asignaciones y moderación. Solo el autor edita su comentario; autor o administrador pueden eliminarlo.

Request/response de esta etapa: contratos TypeScript de persistencia sin `Request`/`Response`. Los repositorios reciben IDs y datos ya extraídos por capas superiores; no aceptan operadores MongoDB arbitrarios ni identidades confiadas directamente desde el body HTTP.

Errores: entradas inválidas, referencia Mongo inexistente/eliminada, conflicto de unicidad y paginación inválida; reutilizar `AppError` donde corresponda. Fallos de conectividad/transacción no se convierten en éxito ni activan un fallback sin transacciones. Los futuros handlers controlarán su representación HTTP.

## Pipeline de middlewares

No se cambia registro de rutas ni middlewares en esta etapa.

Contrato obligatorio para uploads futuros: autenticación -> autorización y comprobación de destino/asignación -> Multer limitado -> validación de firma/tamaño/cantidad/tipo/contenido -> middleware Blob -> controller -> service -> repository. Blob entrega `res.locals.uploadedMedia` tipado. Ningún Service sube archivos. Ante fallo de persistencia se requiere compensación/limpieza; los schemas de lotes y jobs no ejecutan ese proceso por sí solos.

## Persistencia

### PostgreSQL / Prisma

Fuente de verdad de identidad, permisos, catálogo, biblioteca y actividad. Todas las entidades nuevas tienen `String @id @default(uuid()) @db.Uuid` y FK UUID nativa. `uuid()` se genera en Prisma, no implica un `DEFAULT` SQL al escribir por otros clientes. Se conserva intacto `Example`.

Modelos acordados, además de `Example`:

`User`, `WorkEditorAssignment`, `AdminAuditEvent`, `WorkType`, `Work`, `WorkAlternativeTitle`, `Genre`, `WorkGenre`, `Chapter`, `ChapterPage`, `MediaAsset`, `SiteSettings`, `Favorite`, `WorkRating`, `UserChapterRead`, `ChapterReadEvent`, `WorkVisitEvent`, `UploadBatch`, `UploadObject`, `MediaCleanupJob`.

Fechas de instantes en UTC con `Timestamptz`; calendario local con `Date`; numeración de capítulo `Decimal(12,3)` e intercambio futuro como cadena. Puntuación entera en medias estrellas `0..10`. Lecturas anónimas conservan evento de capítulo sin usuario, fecha local ni zona personales; no crean historial invitado. Unicidades e índices de consulta según la propuesta. No crear tablas Prisma de comentarios, votos o reportes.

Migraciones: baseline para `Example` y cambio aditivo del dominio, con SQL revisable y documentación de rutas para una base vacía y una existente. La presencia de una tabla local no prueba el estado de una base conectada. Crear artefactos offline; no ejecutar `migrate dev`, `migrate deploy`, `migrate resolve`, `db push`, reset ni cambios destructivos en bases reales durante esta etapa. No modificar manualmente código generado. Documentar restricciones SQL no representables en Prisma.

Recuperación: conservar tablas/datos anteriores. Antes de aplicar, revisar drift e historial de migración real; una base existente puede necesitar un procedimiento de baseline expresamente revisado. No ejecutar reversión destructiva automática.

### MongoDB / Mongoose

Fuente de verdad exclusiva de comentarios, votos y reportes. Reutilizar conexión Mongoose existente; no abrir clientes por operación. Repositorios MongoDB no importan Prisma ni Express.

`Comment`: `_id`, `authorId`, `targetType`, `targetId`, `parentCommentId`, `rootCommentId`, `bodyMarkdown`, `status`, `revision`, fechas de creación/edición/borrado y `deletedById`. UUID como strings canónicas validadas, generadas con `crypto.randomUUID()`; ninguna PK ObjectId. Principal con padre nulo y raíz propia; respuesta con padre existente activo y destino/raíz derivados de él. Identidad, autor, destino, raíz y padre inmutables. Un documento por comentario, sin arrays de respuestas o ancestros.

`CommentVote`: UUID propio, `commentId`, `userId`, valor `-1/1`, fechas. Índice único `(commentId, userId)`; establecer sustituye el voto actual, retirar es idempotente. Conteo calculado desde votos, sin contadores autoritativos duplicados.

`CommentReport`: UUID propio, comentario, denunciante, motivo/detalles, estado y resolución con sus fechas/revisor. Índice único `(commentId, reporterId)`; estados `OPEN/IN_REVIEW/RESOLVED/DISMISSED`. Listados de moderación separados de los públicos.

Índices de comentario: `(targetType, targetId, parentCommentId, createdAt, _id)`, `(parentCommentId, createdAt, _id)`, `(rootCommentId, createdAt, _id)`; reportes `(status, createdAt, _id)`. Producción necesita creación verificada de índices; no asumir que declarar `unique` prueba existencia remota. No usar `syncIndexes` para eliminar índices ajenos.

Las inserciones de respuesta, voto y reporte se realizan en transacción MongoDB y escriben condicionalmente el comentario padre/destino `ACTIVE` incrementando `revision`. El borrado compite sobre el mismo documento; se conserva marcador y respuestas. Requiere replica set o clúster transaccional compatible; standalone no tiene fallback. Editar/borrar autoría con filtros condicionales, sin sustituir documentos enteros ni permitir modificar identificadores. La autorización administrativa final corresponde a un Service futuro.

### Blob y consistencia entre motores

Blob contiene bytes; SQL almacena referencias/metadatos. Esta etapa no sube archivos ni modifica almacenamiento remoto.

No existen FK entre MongoDB y PostgreSQL ni transacción distribuida. El futuro Service comprobará usuario y destino SQL, permisos/estado y visibilidad antes de operar o publicar comentarios; también resolverá perfiles en lote para evitar consultas por autor. No usar `populate` para referenciar tablas SQL. Las bajas lógicas SQL deben ocultar comunidad mediante gates de lectura pública. Purgas físicas y reconciliación de referencias requieren trabajo posterior; no hay cascada cruzada.

## Contratos compartidos

- UUID: string canónica en límites TypeScript y MongoDB; UUID nativa en PostgreSQL. La identidad no autoriza acceso.
- Cursor: `(createdAt, _id)` estable, lista ascendente; límite entero de `1..100`, cursor inválido se rechaza. Salida acotada `items` y cursor siguiente si hay más; no materializar árbol completo.
- Crear principal: autor y destino validados -> comentario activo con UUID nuevo y raíz propia.
- Responder: autor, padre y texto -> comentario con destino/raíz derivados del padre. No aceptar identidad/campos estructurales mutables desde una actualización genérica.
- Editar: comentario, autor y texto -> modificación condicional del cuerpo y `editedAt`; solo autor. Eliminar: comentario y actor autorizado -> marcador `DELETED`, cuerpo no público y datos de borrado; conserva respuestas.
- Votar/retirar: comentario, usuario, valor válido -> voto único vigente o ausencia; conteos derivados. Reportar: comentario, denunciante, motivo -> reporte único. Resolver: reporte y actor administrativo previamente autorizado -> estado/resolución y fechas.
- Contenido: Markdown original con spoilers `||...||`, string acotada y no vacía cuando activo. Renderizado/sanitización será responsabilidad de presentación futura; no procesar HTML en repositorios.
- SQL: entidades/FK/unicidad según propuesta; idempotency key UUID en eventos de lectura/visita. Reglas de publicación, permisos, fecha local y anonimato se completarán en Services, además de las restricciones SQL.

## Tareas

### PERSIST-01: actualizar propuesta y fijar contratos

Responsable: Planner, con recomendaciones Architect y coordinación raíz.

Archivos propios: `docs/features/MODELO_DATOS_PROPUESTO.md`, `docs/features/PERSISTENCIA_INICIAL.md`.

Dependencias: inspección obligatoria y decisión de comunidad MongoDB confirmada por el usuario. Contrato: propuesta anterior y decisiones -> distribución revisada, plan ejecutable y límites explícitos.

Validaciones: coherencia documental; ninguna afirmación de comentarios SQL, MongoDB opcional para comunidad o funcionalidad HTTP ya operativa. Criterio: ownership, dependencias, aceptación y riesgos registrados antes de implementación.

### PERSIST-02: definir dominio PostgreSQL y artefactos de migración

Responsable: DB.

Archivos propios: `prisma/schema.prisma`, `prisma/migrations/**`, `prisma/README.md`. Cliente generado solo mediante generador y salida configurada; sin edición manual.

Dependencias: PERSIST-01 y contratos compartidos Architect/DB. Contrato: propuesta -> schema Prisma válido, SQL revisable y procedimiento de aplicación posterior.

Validaciones: `npm run prisma:validate`, `npm run prisma:generate`, inspección del SQL y `Example`; `npm run build` al integrar. Sin cambios de datos remotos.

Criterios de aceptación: UUID en nuevas entidades, FK SQL coherentes, decimal exacto, puntuaciones y límites respaldados por restricciones, lecturas anónimas sin historial, índices/únicos requeridos; comunidad ausente de Prisma y `Example` conservado. Documentación distingue crear migración de ejecutarla.

### PERSIST-03: modelos y repositorios MongoDB de comunidad

Responsable: Dev con contrato de persistencia revisado por Architect/DB.

Archivos propios: `src/models/community/**`, `src/repositories/community/**`, incluidos helpers de UUID/cursor/validación de estos módulos. No editar schema Prisma, conexiones, rutas o configuración ajena.

Dependencias: PERSIST-01; no depende de terminar PERSIST-02 porque no importa tipos Prisma ni consulta SQL. Contrato: entradas/salidas de persistencia de comunidad descritas arriba.

Validaciones: tipado estricto, validación Mongoose de creación y actualización, filtros explícitos, UUID/estados/cursor/límites; transacciones locales y escritura condicional de comentario activo para interacciones.

Criterios de aceptación: árbol por referencias, padre/raíz/destino inmutables, operaciones acotadas, votos/reportes únicos, borrado lógico con respuestas conservadas, sin buffers, sin Express/Prisma y sin conexiones nuevas. Requisito de replica set explícito y sin fallback inseguro.

### PERSIST-04: pruebas de invariantes y regresión

Responsable: Test.

Archivos propios: `tests/community/**`, `tests/persistence/**`.

Dependencias: contratos PERSIST-01; implementación final PERSIST-02/PERSIST-03 para ejecutar. Preparación puede hacerse antes con archivos disjuntos. Contrato: casos positivos/negativos y comandos reproducibles -> resultados reales, con distinción entre unitarios, validación de artefactos e integración real.

Validaciones: `node:test` y `tsx` existentes; no instalar framework ni crear un script ficticio. Evaluar UUID inválidos, cuerpos vacíos/límites, valores de voto, inmutabilidad, cursor mal formado/empatado, límites, índices declarados, condiciones de autoría/estado y transacciones.

Criterios de aceptación: pruebas que detecten fallos de contratos, sin afirmar unicidad/concurrencia remotas a partir de mocks. Si no hay replica set de test, documentar integración omitida; no tocar bases de producción. Los tests verifican que repositorios no importen capas superiores cuando resulte útil.

### PERSIST-05: revisión, integración de cambios y push

Responsable: coordinador raíz; Reviewer independiente en solo lectura.

Archivos propios del cierre: estado de este plan y documentación de entrega; cambios funcionales devueltos a su propietario. Dependencias: PERSIST-02, PERSIST-03 y PERSIST-04.

Contrato: diff completo y validaciones -> revisión, correcciones necesarias y commit/push de rama feature. Validaciones: build, Prisma validate/generate, tests pertinentes, diff de archivos/secretos y revisión de migración; no repetir pruebas sin cambios nuevos o dudas pendientes. Hasta dos rondas de corrección acordadas.

Criterios de aceptación: ningún hallazgo crítico abierto sin informar, artefactos coherentes, resultados reales y limitaciones documentadas. Commit/push solo después de coordinar escrituras; sin integración QA/main, force-push ni comandos destructivos. El usuario autorizó push de cambios de la feature, no aplicar migraciones remotas.

## Plan de pruebas

Unitarias: validadores de UUID/texto/votos, cursores y filtros, estructura principal/respuesta, inmutabilidad y actualizaciones condicionales. Esquemas Mongoose pueden validarse sin conexión; eso no prueba índices remotos.

Persistencia SQL: Prisma validate y generación; inspección de relaciones, migraciones y CHECK/únicos, compatibilidad de baseline `Example`. Aplicación a una base efímera solo si se dispone de ella y se aísla explícitamente; no confundir inspección estática con ejecución SQL.

Integración MongoDB: con replica set de pruebas, creación/respuesta/borrado, concurrentes voto/borrado, votos únicos, reportes, rollback y paginación estable. Si no se ejecuta, registrarlo como pendiente sin presentar mocks como prueba del motor.

Autorización: esta etapa comprueba filtros de autoría y contratos de moderación en repositorio. Matriz HTTP, autenticación JWT, asignaciones editoriales y gates SQL/Mongo de publicación serán pruebas de Services/endpoints futuros.

Casos negativos: UUID inválido, referencia inexistente, padre eliminado, modificación de padre/destino/autor, cursor inválido, límite fuera de rango, voto distinto de `-1/1`, estado de reporte inválido, duplicados y servidor sin soporte de transacciones.

Regresiones: build del proyecto; `Example` y configuración/ruta `/health` conservados. Los esquemas de cleanup no se presentan como workers probados.

## Riesgos

- Cross-database: UUID compartido no crea FK; falta futura coordinación de existencia/visibilidad, cuentas borradas y purgas. Evitar duplicar autoridad y no eliminar físicamente referencias en esta etapa.
- MongoDB standalone no ejecuta transacciones requeridas; documentar requisito de infraestructura y falta de integración cuando aplique.
- Índices declarados necesitan verificación en despliegue; unicidad bajo concurrencia requiere índices reales.
- Decisiones de calendario/relectura, límites multimedia, retención y banners siguen como propuestas; schema no sustituye reglas de Service.
- No se conoce el estado de bases conectadas. Baseline/migraciones necesitan auditoría antes de aplicar; no eliminar `Example` ni datos existentes.
- Profundidad lógica arbitraria requiere consultas limitadas, sin recursión de serialización del árbol ni arrays sin límite.
- Conexiones existentes registran URI en debug; hallazgo preexistente ajeno al alcance funcional. No introducir nuevas exposiciones de secretos.

## Integración

Rama feature: `feature/persistence-schemas-community`.

Implementadores: misma sesión/directorio y rama compartida, con propiedad disjunta por archivo. No hay aislamiento real de worktree; no se simula ni se confunde con ramas independientes. El coordinador secuencia contratos, escrituras por propietario y commit final; nadie revierte trabajo ajeno ni integra por su cuenta. DB no delega cambios de schema a Dev.

Implementación local completada: 20 modelos Prisma nuevos y `Example` conservado; baseline y ampliación SQL offline; tres modelos Mongoose de comunidad y sus repositorios, con helpers de validación/sesiones. Sin dependencias nuevas, endpoints ni cambios de configuración.

| Verificación | Resultado real |
| --- | --- |
| `npm run prisma:validate` | Aprobada, antes y después de ampliar el esquema. |
| `npm run prisma:generate` | Aprobada; generador oficial y salida configurada, ignorada por Git. |
| `npm run build` | Aprobada en estado inicial, tras Prisma y tras los últimos cambios MongoDB. |
| `node --import tsx --test tests/community/*.test.ts` | 36/36 aprobadas, 0 fallos y 0 omitidas. Fallos primera/final ejecución de la misma suite: 0/0. |
| Typecheck estricto de tests | Aprobado con `--ignoreConfig --types node`; comando completo en [README de tests](../../tests/community/README.md). |
| Revisión independiente | Reviewer revisó SQL, modelos, repositorios y pruebas; sin hallazgos bloqueantes. Se corrigió una fixture/nombre para describir con precisión el contrato de paginación. |
| Auditoría de seguridad | Inspección estática de modelos/repositorios sin hallazgos confirmados bloqueantes. |

La primera ejecución de tests pasó con avisos de deprecación por `validateSync`; se sustituyó por validación asíncrona para ejecutar los hooks y la suite final pasó sin esos avisos. Dos invocaciones iniciales de typecheck de tests fallaron por opciones CLI requeridas por TypeScript 7 (`--ignoreConfig` y `--types node`); se corrigió el comando, sin cambios productivos para ocultar errores.

No se ejecutaron migraciones, conexiones de prueba a las bases configuradas, despliegue de índices, integración real PostgreSQL/MongoDB, rollback/concurrencia de motor, HTTP ni Blob. Los doubles verifican filtros, sesiones y errores, sin emular el motor. La ejecución MongoDB transaccional requiere replica set o clúster compatible.

Publicación: commit y push coordinados de esta rama feature al cierre. El SHA y la confirmación remota se informan en la entrega final, evitando incluir un identificador autorreferente en el propio commit.

Aprobación QA: no solicitada ni otorgada; no se integra en QA/main en esta etapa.

## Criterios de aceptación

- Propuesta actualizada con PostgreSQL para núcleo y MongoDB para comunidad, UUID y riesgo crossDB explícitos.
- Schema Prisma y migraciones aditivas revisables, `Example` conservado y sin tablas duplicadas de comunidad.
- Modelos/repositorios MongoDB tipados, conexión existente, árbol por referencias, consultas paginadas y operaciones específicas sin cambios estructurales arbitrarios.
- Soft-delete preserva respuestas; votos/reportes únicos; interacciones serializadas frente al borrado mediante transacción y escritura compartida del comentario activo.
- Build/Prisma/tests ejecutados según disponibilidad y resultados precisos; integración real no ejecutada se declara pendiente.
- No se afirman endpoints, permisos de producto completos, uploads o workers implementados solo por existir esquemas.
- Revisión y push de rama feature autorizada; ninguna migración aplicada a bases conectadas ni integración QA/main.
