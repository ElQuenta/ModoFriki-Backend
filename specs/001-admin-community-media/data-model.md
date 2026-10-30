# Data model: administración, sanciones y banners

Diseño objetivo; no schema ejecutado ni migración aplicada. Autoridad y decisiones: [research.md](research.md). Operaciones: [persistencia](contracts/persistence.md).

## PostgreSQL

### User existente

Conservar campos, role BASIC/EDITOR/ADMIN y status ACTIVE/SUSPENDED/DELETED. No agregar privilegios ni reactivación. Repositorio administrativo selecciona id, username, role, status, createdAt y updatedAt; filtra deletedAt/status DELETED pero admite SUSPENDED. Nunca proyecta email, passwordHash o normalizados.

Rol usa expectedUpdatedAt ISO milisegundos. Cambios efectivos avanzan updatedAt a max(hora SQL, anterior+1ms); no-op no avanza ni audita. Actor ADMIN activo y destinatario no ADMIN se comprueban bajo locks. Conserva estado y sanciones. El dato de concurrencia devuelto permite encadenar cambios sin cerrar sesión.

### WorkEditorAssignment existente

Agregar version INTEGER NOT NULL DEFAULT 1 con CHECK positivo. Conservar UUID, UNIQUE(workId,editorId), assignedById, assignedAt y revokedAt; FK RESTRICT. Reasignar reutiliza fila, actualiza responsable/assignedAt, limpia revokedAt e incrementa version, sin borrar auditoría. Revocar incrementa version y registra fecha; degradación revoca todas con un evento por obra en la misma transacción del rol.

Agregar createdAt TIMESTAMPTZ(3) NOT NULL para cursor estable; backfill desde assignedAt de cada fila existente durante migración y valor de creación para nuevas relaciones. Es inmutable al revocar/reasignar. Índice (editorId,createdAt,id) para recorrido; evaluar índice parcial adicional con revokedAt IS NULL mediante planes de consultas, conservando los índices actuales.

La primera asignación exige expectedVersion=0 (ausencia); el listado devuelve version y asignaciones revocadas mediante filtro includeRevoked=true para permitir reasignar. Versiones positivas se comparan con fila existente. Petición al estado actual solo es no-op si precondición coincide; precondición vieja es 409 aunque el estado coincida. Evita que un retry de revocación retire una reasignación posterior. Una repetición con versión actual no duplica eventos.

### CommentSanction nueva

| Campo | Tipo / restricción |
| --- | --- |
| id | UUID PK, generado en servidor |
| userId, imposedById | UUID FK User RESTRICT; destinatario BASIC/EDITOR no eliminado, actor ADMIN activo |
| reason | VARCHAR(2000), trim, 1–2000 caracteres; nunca logs de cuerpo |
| startsAt | TIMESTAMPTZ(3), hora SQL después de locks |
| endsAt | TIMESTAMPTZ(3) nullable; null significa permanente, fin estrictamente posterior al inicio |
| revokedAt, revokedById | Nullable, ambos o ninguno; FK de actor User RESTRICT |
| closedAt | Nullable; cierre administrativo de fila abierta por vencimiento o revocación |
| evidenceType, evidenceId | Ambos null o COMMENT/REPORT + UUID; referencia externa sin FK SQL ficticia |

Índices: historial (userId,startsAt DESC,id DESC); único parcial userId WHERE closedAt IS NULL. No usar now() dentro del predicado. CHECK: longitud del motivo tras trim entre 1 y 2000; endsAt IS NULL o endsAt>startsAt; evidencia con ambos campos IS NULL o ambos NOT NULL y tipo COMMENT/REPORT. El cierre admite exclusivamente las combinaciones de la tabla siguiente, con comprobaciones explícitas IS NULL/IS NOT NULL para evitar que un CHECK acepte un resultado SQL desconocido. El Service valida longitud/fechas antes de efectos y el repositorio refuerza las restricciones en SQL.

| Situación de la fila | revokedAt | revokedById | closedAt | Condiciones |
| --- | --- | --- | --- | --- |
| Abierta, incluso vencida aún no materializada | NULL | NULL | NULL | Vigencia determinada por endsAt y hora SQL, no por el cierre materializado. |
| Revocada mientras estaba vigente | NOT NULL | NOT NULL | Igual a revokedAt | revokedAt>=startsAt; si endsAt no es NULL, revokedAt<endsAt. |
| Cerrada por vencimiento | NULL | NULL | NOT NULL e igual a endsAt | endsAt NOT NULL; el repositorio solo cierra después de alcanzar endsAt según hora SQL bajo lock. |

Los CHECK expresan las relaciones entre campos; la condición temporal de cerrar una fila ya vencida se verifica en la operación SQL bajo lock, sin un CHECK dependiente del reloj. Cualquier combinación distinta se rechaza. Una revocación solicitada después del vencimiento sigue siendo no-op, no una revocación retroactiva.

Vigencia: revokedAt=null y (endsAt=null o endsAt>hora actual), independientemente de closedAt materializado. Al imponer bajo lock, primero cerrar una fila abierta ya vencida con closedAt=endsAt; rechazar otra todavía vigente con 409. Revocar vigente fija revokedAt/revokedById/closedAt conjuntamente. Una revocación repetida o vencida no crea nuevo evento y nunca toca otra sanción. No hay estado SUSPENDED en la sanción: ese es un estado distinto de la cuenta.

Evidencia opcional se valida en Mongo por existencia y autor del comentario; REPORT resuelve su commentId y verifica autor. No copiar Markdown, datos del reportero ni snapshots. Referencias pueden quedar hacia contenido posteriormente retirado sin borrar historial. Una caída durante validación rechaza imposición antes de confirmar SQL.

### CommentCreationDecision nueva

| Campo | Tipo / propósito |
| --- | --- |
| id | UUID PK; también UUID del nuevo comentario y operación |
| authorId | UUID FK User RESTRICT; referencia de permiso, no identidad duplicada |
| state | PREPARED, COMMITTED o REJECTED |
| requestFingerprint | SHA-256 de campos canónicos de la solicitud; no cuerpo ni copia del comentario |
| preparedAt, expiresAt | TIMESTAMPTZ(3), plazo de preparación 60 segundos |
| decidedAt | Nullable hasta decisión terminal |
| rejectionCode | Nullable; SANCTIONED, ACCOUNT_UNAVAILABLE, EXPIRED, CANCELLED, TARGET_UNAVAILABLE |

Índices (authorId,state,id), (state,expiresAt,id). CHECK expiresAt=preparedAt+60 segundos; decidedAt IS NULL o decidedAt>=preparedAt; y exactamente una de las combinaciones siguientes, usando IS NULL/IS NOT NULL explícitos. No contiene target/bodyMarkdown ni copia autoritativa de comentario: el destino se transmite a finalize desde el staging durable para su verificación SQL. COMMITTED/REJECTED terminales; cada transición requiere CAS state=PREPARED y los locks User→Work aplicables. El identificador opcional de reintento HTTP se usa como id, globalmente único; mismo UUID con otro autor/fingerprint produce 409.

| state | decidedAt | rejectionCode | Restricción adicional |
| --- | --- | --- | --- |
| PREPARED | NULL | NULL | Sin decisión terminal. |
| COMMITTED | NOT NULL | NULL | decidedAt<expiresAt; cuenta, sanción y destino revalidados antes de aceptar. |
| REJECTED | NOT NULL | NOT NULL | Código en SANCTIONED, ACCOUNT_UNAVAILABLE, EXPIRED, CANCELLED o TARGET_UNAVAILABLE. |

TARGET_UNAVAILABLE identifica una obra/capítulo no publicado, eliminado, inexistente o con relación de pertenencia no válida al confirmar. Se conserva como rechazo terminal y se traduce a 404 después del commit; ninguna corrección posterior del destino resucita esa operación.

El registro es la decisión durable de permiso de creación. El cuerpo permanece exclusivamente en MongoDB. COMMITTED significa guardado aceptado tras staging Mongo durable; no significa transacción distribuida. Staging aislado nunca es un comentario público ni puede ser padre de respuesta.

### AdminAuditEvent existente

Conservar acciones ROLE_CHANGED/EDITOR_ASSIGNED/EDITOR_REVOKED. Agregar COMMENT_SANCTION_IMPOSED/COMMENT_SANCTION_REVOKED al enum sin redefinir valores existentes y sanctionId UUID nullable FK CommentSanction RESTRICT. Escribir evento de sanción junto a imposición/revocación SQL; motivo permanece en la sanción, sin duplicar evidencia en logs. Cada revocación editorial por degradación emite EDITOR_REVOKED con workId. Auditoría inmutable, sin endpoint público.

### Work existente

Agregar bannerAssetId UUID nullable FK MediaAsset RESTRICT, relación bannerAsset; inversa MediaAsset.workBanners. Conservar coverAssetId/incapBannerAssetId y sus significados.

Agregar legacyPublicationImagesExempt BOOLEAN NOT NULL DEFAULT false, interno e inmutable desde API. En corte sin escritores, marcar únicamente obras con publicación anterior acreditada por publishedAt IS NOT NULL. Incluye DRAFT que antes fue publicada. PUBLISHED sin publishedAt o portada exige reconciliación antes de validar la migración; no inventar evidencia ni eximir por createdAt.

CHECK de publicación: si publicationStatus=PUBLISHED, coverAssetId no null y (legacyPublicationImagesExempt=true o bannerAssetId e incapBannerAssetId no null). Una obra sin exención nunca puede publicar incompleta. Guardar DRAFT sí permite faltantes. Política de eliminación lógica existente despublica y desvincula las tres referencias, sin borrar Blob; exención se conserva. MediaAsset con status DELETING no se puede enlazar como nueva referencia.

### Chapter / ChapterPage / SiteSettings

Sin campos de cierre ni cambios de posición. ChapterPage sigue solo páginas editoriales (1..1000); cierre cuenta como página. Apertura es composición de lectura y no suma páginas. SiteSettings generalBannerAssetId se conserva sin uso nuevo ni eliminación por esta feature.

## MongoDB

### Comment existente

Agregar creationOperationId UUID opcional, inmutable y no controlable por body público. Nuevos comentarios lo llevan siempre y usan el mismo id que CommentCreationDecision. Documentos anteriores conservan campo ausente, no valor null como bypass permitido para nuevos writers.

Índice único parcial de creationOperationId para valores string; índices de target/parent/root y createdAt actuales se conservan. La preparación raíz usa inserción con UUID estable sin sobrescritura; respuesta conserva transacción Mongo y touch del padre. Write concern majority y lectura de confirmación se configuran en operaciones/sesiones pertinentes, sin cambiar globalmente la conexión del resto de módulos.

Los documentos con marcador solo son accesibles si SQL dice COMMITTED; PREPARED, REJECTED o decisión ausente quedan ocultos. Esta regla afecta consultas, acciones, padres y evidencias; no basta filtrar DTO al final. El campo status ACTIVE/DELETED sigue significando estado del contenido, no permiso de publicación ni sanción.

## Migración y transición

1. Migración SQL aditiva para modelos/campos/enums/índices/CHECK; preservar Example y restricciones previas, revisar diff generado offline antes de aplicar.
2. Preparar schema e índices Mongo sin modificar contenidos históricos; detener todos los writers antiguos antes del corte. No tratar un comentario nuevo sin marcador como legacy válido después del despliegue.
3. Capturar y validar exención histórica en ventana sin publicaciones concurrentes; ningún cliente puede enviar flag o timestamps de exención.
4. Generar Prisma mediante prisma:generate en src/generated/prisma, no editarlo. Probar rollback transaccional/fallo y recuperación hacia adelante en destino desechable.
5. No purgar provisionales, auditoría, sanciones ni Blob. La reconciliación acotada solo resuelve decisiones y conserva evidencia de fallos; no restaura REJECTED aunque venza o se revoque la sanción.

## DTO separados de persistencia

No exponer legacyPublicationImagesExempt, creationOperationId, huella, estados internos o FK de auditoría en respuestas públicas. User DTO privado sin email por falta de necesidad de esta feature. SanctionDto ADMIN puede ver actor/fechas/evidencia; vista propia solo active, reason, endsAt, permanent. Detalle capítulo añade readingImages y conserva JSON de pages, número Decimal y tamaños BigInt como strings con convención actual.
