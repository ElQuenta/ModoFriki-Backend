# Contrato HTTP propuesto

Base `/api`. Diseño para implementar; no endpoints entregados en esta fase. Respuestas existentes: `{success:true,code:200|201,data:...}`; errores `{success:false,code,error:{message}}`. Sin nuevo envelope global. UUID, instantes ISO UTC de milisegundos; desconocidos rechazados en rutas nuevas con Joi estricto.

## Usuarios y asignaciones

Todas las rutas `/admin` requieren authenticate y authorize ADMIN activo; revalidación en service/repositorio. Destinatarios no eliminados; ADMIN no admite cambio de rol ni sanción. No endpoint de creación de ADMIN o borrado de cuentas.

| Método/ruta | Entrada | data / HTTP |
| --- | --- | --- |
| GET /admin/users | limit?, cursorCreatedAt?, cursorId?, role?, status? | CursorPage AdminUser / 200 |
| GET /admin/users/:userId | params UUID | AdminUser / 200; permite refrescar CAS sin recorrer listado |
| PATCH /admin/users/:userId/role | `{role:BASIC\|EDITOR,expectedUpdatedAt}` | AdminUser / 200 |
| GET /admin/users/:userId/work-assignments | limit?, cursorCreatedAt?, cursorId?, includeRevoked?=false | CursorPage Assignment / 200 |
| PUT /admin/users/:userId/work-assignments/:workId | `{expectedVersion:integer>=0}` | Assignment / 200; 0 significa relación ausente |
| PATCH /admin/users/:userId/work-assignments/:workId/revocation | `{expectedVersion:integer>=1}` | Assignment / 200 |

AdminUser: `{id,username,role,status,createdAt,updatedAt}` sin email/hash/normalizados. Cambio rol admite ACTIVE/SUSPENDED y conserva estado/sanciones; degradación revoca asignaciones atómicamente. No-op con expectedUpdatedAt actual no audita; precondición vieja es 409 incluso si rol solicitado coincide.

Assignment: `{id,workId,editorId,assignedById,assignedAt,revokedAt,version,createdAt}`. Agregar createdAt estable en relación durante migración: inicializar con assignedAt histórico y mantenerlo inmutable después. Listar por createdAt ASC,id ASC, no assignedAt mutable. Solo asignar a EDITOR ACTIVE y obra no eliminada. Revocar relación vigente de suspendido sí retira permisos, sin reactivarlo. Reasignación explícita reutiliza relación, incrementa version y no borra auditoría. Petición ya satisfecha con versión actual es 200 sin cambio; versión vieja siempre 409. Relación ausente al revocar: 404.

CursorPage: `{items,hasMore,nextCursor:{createdAt,id}|null}`. limit 20 por defecto y 100 máximo, toma limit+1; pareja cursor completa o ninguna; fecha/UUID malformados 400. Usuarios/assignments orden asc estable; usuarios filtran eliminados siempre. Filtro status admite ACTIVE/SUSPENDED, nunca devuelve eliminados. Los cursores avanzan sobre claves inmutables.

## Sanciones y vista propia

| Método/ruta | Entrada | data / HTTP |
| --- | --- | --- |
| GET /admin/users/:userId/comment-sanctions | limit?, cursorCreatedAt?, cursorId? | `{current:SanctionDto\|null,history:CursorPage<SanctionDto>}` / 200 |
| POST /admin/users/:userId/comment-sanctions | `{reason,endsAt:ISO\|null,evidence?:{type:COMMENT\|REPORT,id:UUID}}` | SanctionDto / 201 |
| PUT /admin/users/:userId/comment-sanctions/:sanctionId/revocation | cuerpo vacío | SanctionDto / 200 |
| GET /auth/me/comment-restriction | solo identidad autenticada | RestrictionDto / 200 |

Reason trim 1..2000 caracteres; endsAt explícito null es permanente, fecha > hora SQL después de lock. No startsAt del cliente. Evidencia opcional; si está, validar autor de comentario o del comentario reportado. La sanción no cierra ni resuelve reportes y resolverlos no impone sanciones automáticamente.

SanctionDto privado: `{id,userId,reason,startsAt,endsAt,permanent,status,imposedById,revokedAt,revokedById,evidence:null|{type,id}}`, status calculado ACTIVE/EXPIRED/REVOKED con reloj del servidor, sin closedAt interno. History orden startsAt DESC,id DESC: su cursorCreatedAt representa startsAt y condición estrictamente menor. current se calcula independientemente de página/cursor y vale null si no vigente. Vista propia `{active,reason:string|null,endsAt:string|null,permanent:boolean}`; sin id de actor, reportero, evidencia o historial. ADMIN recibe vista propia sin restricción.

Revocar verifica pertenencia sanctionId/userId; ya revocada o vencida retorna estado actual sin auditoría nueva. Nunca selecciona implícitamente la sanción actual; retry de una antigua no afecta la posterior. Otra imposición mientras haya vigente es 409; vencida deja de bloquear sin cron.

## Creación y lectura de comentarios existentes

Conservar rutas/body/envelopes actuales, incluida raíz/respuesta por CommunityService.create. Añadir soporte opcional `Idempotency-Key: UUID` en creación; sin cabecera se genera UUID servidor y se conserva comportamiento de cliente que no reintenta automáticamente POST. Con cabecera, mismo autor/solicitud reproduce resultado por el mismo id; misma clave con datos diferentes es 409. El UUID se usa como identificador de decisión y comentario; no aceptar creationOperationId del body. La huella no se devuelve ni registra.

No devolver 201 antes de decisión COMMITTED y comprobación del documento durable. Ante resultado incierto, 503 `Comment creation outcome unavailable` sin afirmar que no se guardó; reintentar con la misma clave. COMMITTED se consulta por UUID y no se transforma en nuevo comentario. REJECTED por sanción permanece rechazado incluso tras revocación/vencimiento; un nuevo envío necesita nueva clave.

Sanción vigente rechaza con 403 `Comment creation is restricted`; UI consulta vista propia para motivo/fin y no cierra sesión. Cuenta suspendida/eliminada sigue sin autenticarse según contrato existente. Falta de SQL/Mongo requerido: error seguro 503, nunca publicar por defecto.

La publicación y ausencia de baja del destino se comprueban nuevamente al confirmar la creación, serializadas con las mutaciones de catálogo. Si WORK o CHAPTER/obra padre dejaron de estar disponibles, se confirma internamente REJECTED/TARGET_UNAVAILABLE y se responde 404 genérico después del commit, sin exponer el estado interno. Una aceptación ya COMMITTED no se revierte por una retirada posterior: su consulta aplica la visibilidad vigente del catálogo.

Todo acceso a comentario con marcador exige COMMITTED. Buscar por id oculto es 404; igual para edit/delete/vote/report/parent/evidencia. Listas roots/replies/thread filtran candidatos en lote antes del DTO y cómputos de votos. Con provisionales, puede haber items=[] y hasMore=true; cursor apunta al último candidato examinado, no al último visible. No iterar sin límite para rellenar página. El cursor {createdAt,id} es metadato de continuación y puede contener la fecha/UUID del candidato provisional examinado, sin cuerpo ni estado: no se promete opacidad de ese identificador. El consumidor debe seguir hasMore, no inferir fin por longitud. Si SQL no permite comprobar decisiones de documentos marcados, devolver 503, sin tratar marcadores null/malformados como legacy.

La paginación de comentarios no es una instantánea. Un provisional examinado y confirmado después puede quedar detrás del cursor; continuar ese recorrido no lo incorpora retroactivamente. Actualizar comentarios significa volver a solicitar la primera página sin cursor y sustituir la colección local antes de continuar. Conservar createdAt/orden editorial actual y consultas acotadas; no se promete actualización automática en tiempo real.

## Catálogo y multimedia

Conservar endpoints, JSON de metadatos, expectedUpdatedAt y expectedVersion existentes. En POST/PUT/PATCH de obra multipart: cover? (portada), banner? (ficha), inpagecover? (apertura). Máximo un archivo de cada campo, 10 MiB cada uno y 100 MiB total. Los archivos se verifican por contenido con validación actual. No URLs externas, nombres/rutas ni referencias de activos proporcionadas por cliente como sustituto del upload.

WorkDto conserva coverAsset/incapBannerAsset y añade bannerAsset nullable; no expone exención interna. Omitir archivo conserva referencia. DRAFT admite faltantes. PUBLISHED de obra sin exención exige las tres referencias efectivas; el caso antiguo exento conserva disponibilidad/edición y publicación de capítulos sin exigir completar banners. Banner de ficha no aparece dentro del capítulo.

GET /works/:workId/chapters/:chapterId conserva pages exactamente y añade:

```typescript
type ReadingImage =
  | { kind: 'WORK_OPENING'; asset: PublicAssetDto; pageId: null; position: null }
  | { kind: 'PAGE'; asset: PublicAssetDto; pageId: string; position: number };
// data.readingImages: ReadingImage[]
// PublicAssetDto reutiliza representación pública actual de MediaAsset.
```

Orden: apertura vigente si existe, después pages por posición. N/N+1 elementos, sin deduplicar páginas por URL. pages[].id/position/asset y chapter version permanecen iguales. No cambiar retorno de listas/mutaciones para obligar el nuevo campo; detalle tiene DTO propio. El frontend usa readingImages para mostrar y pages para edición/progreso; deja de añadir apertura consultada aparte. No GET de actividad ni nueva clase de cierre: un mensaje final usa pages multipart normal y cuenta como página editorial.

## Errores y documentación de entrega

400 validación/campos/desconocidos; 401 autenticación inválida; 403 rol insuficiente/protección ADMIN/sanción; 404 recurso oculto/inexistente o evidencia no válida; 409 CAS/versión/clave o sanción vigente; 413 límites; 415 formatos según contrato de catálogo vigente; 503 dependencia/resultado incierto. Errores inesperados 500 genérico. No mensajes del proveedor, stack, cuerpos sensibles, credenciales o datos de reporteros.

Actualizar docs/API.md y openapi.yaml durante P5 para todos los endpoints, campos, cursores, cabecera opcional y errores. Este documento no modifica todavía el OpenAPI ejecutable ni otro repositorio. La comprobación de compatibilidad del consumidor es condición antes de despliegue, especialmente páginas vacías con hasMore y la nueva secuencia de lectura.

Evidencia obligatoria del consumidor en validation/frontend-contract.md: repositorio y versión o SHA revisado, responsable, fecha, entorno y resultado de escenarios de página vacía con hasMore=true, refresco desde primera página tras confirmación tardía, readingImages sin apertura duplicada y conservación del progreso por posiciones editoriales. Se necesita aceptación explícita del responsable del consumidor; documentar el contrato o una aprobación de QA sin esa evidencia no la sustituye. Si falta acceso o respuesta del frontend, registrar la dependencia externa pendiente y bloquear el despliegue, sin afirmar que se validó otro repositorio ni enviar mensajes sin autorización.
