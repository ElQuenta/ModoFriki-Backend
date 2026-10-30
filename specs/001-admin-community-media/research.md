# Research: integración con las librerías actuales

Fecha 2026-10-29. Fuentes: [spec](spec.md), [constitución](../../.specify/memory/constitution.md), código/lockfile y vault Obsidian local revisión 8cbd099705946a419deddb2571a535a9c5891cf0. Investigación solo lectura por planner, DB y media; coordinación documental principal. Sin pruebas de proveedores ni migraciones ejecutadas.

## R1. Dependencias y pruebas

**Decision**: Mantener versiones del lockfile y clientes compartidos. Ninguna dependencia nueva. Vitest, Node fetch/http, Prisma/Mongoose y proveedores desechables externos cubren validación.

Corrección aprobada I1: la separación de archivos requiere excluir `**/*.integration.test.ts` de la suite habitual e incluir únicamente esos archivos en la configuración de integración. Mantener variables ficticias y exclusiones predeterminadas de unitarias; integración exige destinos dedicados y no hereda las variables ficticias. Ambos inventarios deben ser disjuntos.

**Rationale**: Joi ya valida; Multer temporal y validación estructural JPEG/PNG/WebP ya existen; Blob permite cargas controladas. node:crypto genera UUID/huellas. No se necesitan transformaciones de imágenes, cola ni otro ORM.

**Alternatives considered**: sharp/file-type duplican capacidad existente; Redis/BullMQ añaden otro proveedor; Supertest/Testcontainers son comodidades sin necesidad demostrada. No se instalan. Si aparece necesidad real, documentar decisión/versión y actualizar lockfile con checks, como autorizó el usuario.

## R2. Administración y validación

**Decision**: Finder administrativo propio para incluir SUSPENDED sin habilitar autenticación. ADMIN activo por guard y revalidación SQL. Rol con expectedUpdatedAt monotónico; asignación con versión entera. Nuevas rutas Joi con stripUnknown:false.

**Rationale**: AuthRepository solo retorna ACTIVE; usarlo para destinatarios contradice el spec. validateQuery elimina campos desconocidos. No cambiar silenciosamente contratos existentes.

**Alternatives considered**: Rol del token, finder ACTIVE para todo o nuevo envelope global de error: descartados. AppError/error.handler ya soportan 403 estable más consulta propia de restricción.

## R3. Sanción y creación entre proveedores

**Decision**: Mongo provisional con creationOperationId; journal SQL PREPARED→COMMITTED/REJECTED terminal. Sanción y finalización bloquean la misma User. Todo acceso nuevo consulta decisión COMMITTED en lote; legacy sin marcador conserva reglas anteriores tras corte sin writers viejos.

Corrección aprobada C1: finalize recibe metadatos de destino derivados del staging durable y revalida en SQL que obra/capítulo sigan publicados y no eliminados bajo orden User→Work. Retirada ganadora persiste TARGET_UNAVAILABLE antes de responder 404; los datos del comentario siguen únicamente en Mongo. La política aprobada G1 mantiene paginación no instantánea: confirmaciones detrás del cursor aparecen al refrescar desde la primera página, no al continuar el recorrido anterior.

**Rationale**: La preparación Mongo durable no es publicación; guardado aceptado se linealiza en el commit SQL posterior. Sanción que gana rechaza todas las PREPARED. Un write Mongo tardío no se publica. SQL guarda solo permiso/metadatos, no Markdown ni entidad autoritativa de comentario. [Protocolo](contracts/persistence.md).

**Alternatives considered**: Precheck middleware/doble lectura dejan carrera. Lock SQL alrededor de await Mongo no basta ante timeout/crash que libera lock y deja write remoto tardío. Copiar sanción a Mongo duplica autoridad. No existe transacción distribuida. Un booleano Mongo nunca reemplaza la decisión SQL en el diseño elegido.

**Fuentes**: Los locks serializan operaciones SQL hasta fin de transacción ([PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html)); Prisma v7 soporta transacciones interactivas y recomienda mantenerlas cortas ([Prisma v7](https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions)). Majority y timeout no confirman otra base ([Mongo write concern](https://www.mongodb.com/docs/v8.0/reference/write-concern/)); el driver contempla commit de resultado incierto ([especificación oficial](https://github.com/mongodb/specifications/blob/master/source/transactions/transactions.md)). El protocolo es una decisión propia derivada de estas limitaciones y debe probarse, no una garantía certificada por las fuentes.

## R4. Vencimiento, auditoría y locks

**Decision**: Sanción abierta única por índice parcial closedAt IS NULL; cerrar la vencida bajo lock antes de otra imposición. Vigencia usa hora SQL obtenida después de adquirir locks. Auditoría atómica y orden User UUID asc → Work UUID asc.

Corrección aprobada U1: data-model.md define tablas exhaustivas de PREPARED/COMMITTED/REJECTED y cierre abierto/revocado/vencido, con IS NULL/IS NOT NULL explícitos y fecha de decisión no anterior a preparación. El código TARGET_UNAVAILABLE forma parte de los rechazos permitidos. No delegar esas combinaciones a interpretación al crear CHECK.

**Rationale**: Un índice no puede cambiar por el reloj sin actualización. endsAt determina vigencia sin cron; closedAt gestiona unicidad. Catálogo toma actualmente Work antes de consultar usuario: normalizar para evitar inversión.

**Alternatives considered**: Índice basado en now(), cron que reactive cuentas, mutex de proceso y cambio global a Serializable. No satisfacen el alcance o no sustituyen el protocolo.

## R5. Imágenes y excepción histórica

**Decision**: banner→Work.bannerAssetId/bannerAsset, inversa workBanners; preservar cover e inpagecover/incapBannerAsset. Namespace Banners. Flag legacyPublicationImagesExempt fijo desde publicación acreditada durante corte.

**Rationale**: Apertura y ficha usan formatos distintos. SiteSettings es global. Exención fija persiste al despublicar/republicar y no se obtiene automáticamente tras publicar una obra nueva.

**Alternatives considered**: Reutilizar apertura contradice al usuario; usar status PUBLISHED continuamente exime obras nuevas; createdAt exime borradores nunca publicados. No copiar Blob ni cambiar slug histórico.

## R6. Lectura y limpieza

**Decision**: ChapterDetailRecord consulta apertura; service compone readingImages conservando pages, posiciones y todos los duplicados editoriales intencionales. Añadir workBanners a la comprobación de activos sin referencias.

**Rationale**: Preserva progreso/edición. El cierre opcional ya cabe en páginas. Receiver y prepare deben admitir tres campos; publicar se verifica antes de Blob y al confirmar.

**Alternatives considered**: Insertar apertura en ChapterPage rompe conteos. Borrar banners sustituidos o activar limpieza periódica contradice la política vigente.

## R7. Despliegue y validación

**Decision**: Proveedores desechables reales, configuración Vitest separada, migración aditiva revisada y corte exclusivo de writers. No downgrade a versión sin filtro del journal.

Corrección aprobada G2: exigir evidencia y aceptación del responsable del consumidor identificando versión/SHA, entorno y resultados de hasMore/refresco/readingImages/progreso antes de desplegar. Un documento de transición no acredita esa validación; una dependencia externa sin resolver bloquea despliegue, sin presuponer autorización para contactar a terceros.

**Rationale**: Replies ya requieren replica set; no hay fallback standalone. Vitest actual fija URLs ficticias. README cita un baseline que no figura en directorio local: historial real requiere preflight, no invención de migraciones.

**Fuentes**: Mongoose usa sesiones/transacciones del driver, sin extenderlas a PostgreSQL ([Mongoose transactions](https://mongoosejs.com/docs/transactions.html)). Página consultada muestra 9.11.4; lock local fija 9.11.2, que se conserva y cuyas firmas deben contrastarse al implementar.

**Alternatives considered**: Rolling mixto y mocks solamente no aceptan la garantía estricta. No ejecutar migrate dev/reset/db push o seed en base compartida.

## Resultado

Decisiones técnicas del diseño resueltas. Quedan controles de ejecución: destinos/versiones, historial/drift, respaldo y pruebas antes de despliegue. No son nuevas preguntas de producto ni capacidades verificadas de la infraestructura actual.
