# Feature: Biblioteca, vistas y actividad de lectura de usuarios

## Objetivo

Conectar usuarios y catálogo con favoritos, puntuaciones, visitas, progreso e historial, calendario y rachas. El frontend notifica explícitamente la apertura del lector para marcar el capítulo como leído. El usuario también puede marcar capítulos leídos antes de registrarse sin inventar actividad histórica.

## Estado actual

Se inspeccionaron AGENTS.md, la skill modofriki-features, docs/agents/WORKFLOW.md, package.json, tsconfig.json, prisma/schema.prisma, prisma.config.ts, src/config/database/*, src/config/env.ts, src/app.ts, src/index.ts, rutas auth/catalog/community, handlers, middlewares auth/validación y servicios/repositorios existentes. Se consultó docs/features/MODELO_DATOS_PROPUESTO.md.

PostgreSQL ya contiene Favorite, WorkRating, UserChapterRead, ChapterReadEvent y WorkVisitEvent, sus relaciones y sus índices. La migración core_domain añade CHECK de puntuaciones 0..10, contexto de identidad de eventos e índice único parcial usuario/capítulo/fecha local. No existe API de estas interacciones. Catálogo permite drafts a personal autorizado, pero esta feature opera sobre contenido publicado. Auth entrega identidad y timezone en res.locals.user; Joi y createLogger/catchAndLogError son convenciones existentes. TypeScript strict y salida Prisma src/generated/prisma. Scripts disponibles: build, dev, start, prestart y prisma:generate/validate/migrate/deploy/studio; no scripts test/lint.

## Alcance

Incluye visitas públicas, lecturas públicas y autenticadas, estado manual individual, favoritos, puntuaciones, estadísticas públicas por obra y consultas privadas de biblioteca/actividad. No incluye uploads, nuevas conexiones, sincronización de invitados a cuentas, fechas históricas proporcionadas por cliente, cambio de zona horaria, estimación de tiempo o páginas leídas, ni marcado masivo. El endpoint individual permite importar el estado anterior a la cuenta.

Decisión coordinada con architect: reutilizar entidades existentes, separar estado actual de eventos; no escribir desde GET; estado y evento autenticado atómicos. La revisión de idempotencia requirió añadir ChapterReadReceipt mediante migración aditiva: conserva también las claves de operaciones deduplicadas por día para impedir que un reintento mañana cuente otra vez. Esta feature reemplaza la semántica de finalización propuesta anteriormente por apertura reportada por frontend; el marcado manual deja de generar eventos.

## API

Prefijo /api. Respuestas usan SuccessResponseHandler: {success:true,code:200,data:...}; DELETE devuelve NoContentResponseHandler (204). Fechas DTO ISO UTC; fechas de calendario YYYY-MM-DD. Identificadores UUID. Se rechazan campos desconocidos y fechas/hora aportadas al registrar eventos. Todos los roles activos registrados tienen las mismas capacidades personales.

| Método y ruta | Autenticación | Entrada | data / comportamiento |
| --- | --- | --- | --- |
| POST /works/:workId/visits | Opcional | {idempotencyKey:UUID} | {counted,occurredAt}; registra visita explícita a ficha |
| GET /works/:workId/stats | Pública | workId | {workId,visits,visitsLast24Hours,reads,readsLast24Hours,favorites,ratings,averageRating} |
| PUT /me/favorites/:workId | Obligatoria | Sin body | {workId,isFavorite:true}; idempotente |
| DELETE /me/favorites/:workId | Obligatoria | Sin body | 204; idempotente |
| GET /me/favorites | Obligatoria | page,limit | ReadingPage de {work:{id,title,slug,coverUrl},createdAt} |
| PUT /works/:workId/rating | Obligatoria | {score:número 0..5 en pasos de 0.5} | {workId,score}; upsert |
| DELETE /works/:workId/rating | Obligatoria | Sin body | 204; elimina puntuación propia idempotentemente |
| POST /chapters/:chapterId/read-events | Opcional | {idempotencyKey:UUID} | {counted,occurredAt,isRead?}; apertura reportada, estado=true para cuenta |
| PUT /me/read-chapters/:chapterId | Obligatoria | Sin body | {chapterId,isRead:true,firstReadAt,lastReadAt}; solo estado |
| DELETE /me/read-chapters/:chapterId | Obligatoria | Sin body | 204; estado=false, no borra eventos |
| GET /me/reading-history | Obligatoria | page,limit | ReadingPage de {chapterId,isRead,firstReadAt,lastReadAt,work,chapter:{id,number,title}} |
| GET /me/works/:workId/progress | Obligatoria | page,limit | {workId,isFavorite,score,totalChapters,readChapters,completionPercentage,chapters:ReadingPage} |
| GET /me/reading-calendar | Obligatoria | from,to YYYY-MM-DD opcionales, default últimos 365 días locales | {timezone,from,to,days:ReadingDay[]}; cada día {date,chaptersRead}, intervalo inclusivo <=366 días |
| GET /me/reading-stats | Obligatoria | Sin parámetros | {markedReadChapters,favorites,recordedReads,activeDays,readsToday,readsLast7Days,readsLast30Days,currentStreak,longestStreak,lastReadingDate,timezone} |

Paginación acorde catálogo: page entero 1..100000 default1 y limit entero 1..100 default20; servicio traduce a skip=(page-1)*limit,take=limit. ReadingPage interno={items,total,skip,take}; DTO público={items,total,page,limit}. Orden estable, con ID como desempate; historial es estado actualmente leído, no timeline ilimitado de eventos. Progreso lista capítulos publicados paginados con su estado propio; totalChapters y readChapters solo cuentan capítulos publicados disponibles.

score público se convierte a scoreHalfStars interno multiplicando por dos. completionPercentage=readChapters/totalChapters*100 (0 sin capítulos). averageRating expresa estrellas (promedio scoreHalfStars dividido por dos), null sin votos; cero es puntuación válida. reads cuenta eventos aceptados, incluyendo anónimos; no lectores únicos verificados. Ventanas públicas de 24h son móviles usando occurredAt. readsLast7Days y readsLast30Days incluyen hoy y los 6/29 días locales anteriores.

Errores: 400 UUID/body/query/intervalo inválido; 401 token ausente en ruta privada o inválido en ruta opcional; 404 destino no publicado/eliminado; 409 clave idempotente reutilizada con otro destino o identidad/contexto; 500 error interno sin credenciales. Las rutas /me nunca aceptan userId para seleccionar otra identidad. DELETE de estado propio permite limpieza aun si el destino se ocultó, sin devolver sus datos; PUT y creación de eventos requieren contenido publicado y no eliminado.

## Pipeline de middlewares

Autenticación obligatoria u opcional según tabla -> validación Joi de params/body/query -> Controller (extrae req y res.locals.user) -> Service (reglas, validación y mapeo) -> Repository (persistencia/transacciones). Para GET público sin identidad necesaria no se exige auth. Si se usa auth opcional se rechaza token inválido. Mantener factories de router/controller, AppError, handlers y logs estáticos sin datos sensibles. Registrar router en /api desde app.ts. Esta feature no tiene Multer, Blob ni archivos.

## Persistencia

PostgreSQL / Prisma: única fuente de verdad mediante cliente compartido. ChapterReadReceipt contiene idempotencyKey UUID primaria, eventId FK RESTRICT y createdAt; no duplica identidad ni capítulo del evento. Migración aditiva preparada sin aplicar; cliente regenerado por herramienta, nunca editado manualmente. MongoDB: comunidad sigue siendo su único consumidor; no duplicar biblioteca o eventos. Vercel Blob: solo referencias ya existentes para portada.

Favorite y WorkRating usan únicas compuestas; upsert y eliminación idempotente. Puntuación integer0..10 más CHECK SQL existente. Crear lecturas autenticadas y upsert UserChapterRead en una transacción; verificar usuario activo y zona User real, capítulo publicado y padre publicado/no eliminado dentro de la operación. Crear visitas validando obra publicada/no eliminada. Si existe concurrencia con retirada de catálogo, usar bloqueo coordinado con persistencia catálogo según criterio DB.

UUID idempotencyKey único por tabla de evento: replay solo coincide si capítulo/usuario (o anonimato) coincide; otro contexto ->409. Un mismo usuario/capítulo/localDate aporta un evento como máximo; otro UUID el mismo día devuelve counted=false. Usar inserción que soporte conflicto sin abortar transacción (createMany skipDuplicates y resolución del evento existente), sin capturar P2002 dentro de transacción PostgreSQL abortada. Relectura otro día cuenta nuevamente. Hora server; usuario autenticado aporta localDate y timezoneAtEvent desde zona DB. Invitado conserva esos tres campos de identidad nulos y no tiene estado personal.

PUT manual solo actualiza UserChapterRead; firstReadAt/lastReadAt reflejan registro del estado en backend y no demuestran fecha real de lectura. DELETE manual marca false (si no existe, éxito idempotente); no elimina eventos ni reduce racha. Un replay de apertura no introduce contribución nueva ni restaura un estado desmarcado posteriormente: devuelve el estado actual. Rachas cuentan DISTINCT localDate de eventos: actual anclada hoy o ayer, máxima mayor secuencia; marcado manual no participa. Calendario usa localDate almacenada y rellena días sin actividad con cero; no reinterpreta pasado al consultar.

Índices existentes cubren usuario/favoritos, usuario/historial, obra/vistas, capítulo/eventos y usuario/localDate. Consultas paginadas con take acotado; calendario <=366 días. Métricas históricas agregadas en DB, no cargar todos los eventos individuales a memoria. Los listados y DTO de recursos filtran publicación y borrado lógico, incluso padres de capítulos. Actividad agregada puede preservar contribuciones históricas sin exponer detalles de recursos retirados.

Plan de recuperación: migración DDL aditiva sin ejecución en esta sesión. Desplegar la migración antes de iniciar esta versión de la API. Revertir código permite conservar la tabla y todos los datos; no purgar datos para revertir. No ejecutar reset ni eliminaciones masivas.

## Contratos compartidos

DB es propietario de src/types/reading.types.ts y ReadingRepositoryContract ya acordado: recordVisit, recordRead, setReadState, setFavorite, listFavorites, setRating, getWorkState, listHistory, getCalendar, getStats, getWorkStats. ReadingActor={id,timezone}, ReadingPageInput={skip?,take?}, ReadingEventResult={counted,occurredAt:Date,isRead?}. Tipos internos usan Date y DTO los serializa Service. setRating(...,null) elimina y setReadState(...,false) desmarca. No incorporar Express al Repository ni al Service. No hay metadatos multimedia nuevos.

## Tareas

### TASK-01 — Contratos y persistencia
Responsable: db (/root/persistence).
Objetivo: implementar operaciones atómicas y agregados usando tablas reales.
Archivos propios: src/types/reading.types.ts; src/repositories/reading/**.
Dependencias: inspección y decisiones architect; primero cerrar tipos compartidos.
Contrato: ReadingRepositoryContract descrito arriba; fechas Date; actor validado contra User real.
Validaciones: prisma:validate y revisión de uso de índices/conflictos; build combinado lo ejecuta coordinador. No tests por petición usuario.
Criterios: idempotencia y dedup concurrente incluso entre días, recibos persistidos y bloqueo transaccional de clave antes de obra/usuario, manual sin eventos, agregados y lecturas anónimas correctos; logs existentes sin errores de driver expuestos.

### TASK-02 — API y reglas de negocio
Responsable: dev.
Objetivo: exponer contratos anteriores y conectar identidad, filtros y DTO.
Archivos propios: src/routes/reading.routes.ts; src/controllers/reading/**; src/services/reading/**; src/middlewares/schemas/reading.schema.ts; src/app.ts.
Dependencias: TASK-01 contrato TypeScript cerrado; escrituras de implementación después de DB en este workspace compartido.
Contrato: tabla API, page/limit, handlers y errores existentes; auth opcional eventos, obligatoria /me y rating.
Validaciones: build, revisión de validaciones y rutas; no tests.
Criterios: ningún GET escribe, ningún userId permite actuar por otra cuenta, UUID requerido para eventos, estado manual y métricas diferenciados; sin consultas directas en controller/service.

### TASK-03 — Documentación e integración
Responsable: coordinador root.
Objetivo: registrar API y definición funcional real.
Archivos propios: openapi.yaml; docs/features/MODELO_DATOS_PROPUESTO.md; actualización final docs/features/user-reading.md después de la entrega planner.
Dependencias: TASK-01 y TASK-02 completos.
Contrato: OpenAPI debe reflejar rutas, autenticación, score público 0..5 y conversión interna half-stars 0..10, ejemplos de eventos y marcado histórico, límites y respuestas reales.
Validaciones: npm run build, npm run prisma:validate, sintaxis OpenAPI y correspondencia rutas/documentación; revisión independiente solo lectura.
Criterios: documentación no promete finalización real ni actividad retroactiva; resultados reales de verificaciones y pendientes publicados.

## Plan de pruebas

Unitarias, integración, autorización, casos negativos y regresiones: no se crearán ni ejecutarán por solicitud expresa del usuario. No se agrega dependencia de test. Build y schema validation verifican compilación/esquema, no comportamiento de base en ejecución. Riesgos sin validación dinámica: concurrencia de UUID, medianoche/DST, rachas y filtros de soft-delete; revisión independiente debe examinarlos.

## Riesgos

Las aperturas reportadas no prueban lectura completa; clientes deben llamar POST al abrir y reusar UUID al reintentar. Nuevos UUID anónimos pueden inflar métricas: son eventos, no personas únicas; antiabuso distribuido queda fuera. Rachas requieren zonas IANA válidas; no aceptar fecha ni timezone arbitrarios del body. Instantes del marcado manual no son fechas históricas reales. Retirada de catálogo debe impedir escrituras tardías y ocultar recursos en consultas; DELETE personal sigue disponible. Sin pruebas ejecutadas queda riesgo de integración runtime; comunicarlo sin presentar build como test.

## Integración

Rama feature: feature/user-reading, creada por coordinador. Agentes comparten directorio y rama; no tienen worktrees aislados. Archivos disjuntos y escrituras de aplicación secuenciadas DB -> Dev -> corrección DB; documentación independiente del coordinador. Planner solo crea este plan; no toca código. Sin commits ni merges; SHA no aplica. Aprobación QA: no solicitada/no integrada.

Resultados reales: npm run build pasó inicialmente con persistencia, después con API, tras la corrección de recibos y en la compilación final combinada. npm run prisma:generate completó con Prisma 7.10.1; npm run prisma:validate pasó con el modelo final. OpenAPI se analizó con la dependencia yaml existente y se ajustó a respuestas 401 opcionales y calendario con días en cero. git diff --check terminó sin errores de espacios. Pruebas iniciales/finales: N/D / N/D por petición expresa del usuario; no se accedió a PostgreSQL, MongoDB ni Blob, y no se aplicaron migraciones.

Reviewer y security completaron revisión estática sin bloqueantes; se corrigieron las diferencias menores de documentación detectadas. No equivale a validación dinámica de SQL o concurrencia. Limitación conocida: las operaciones públicas admiten UUID nuevos y el proyecto no tiene rate limiting; las métricas anónimas son eventos aceptados, sin garantía de lectores únicos. Antes de desplegar se debe aplicar 20261019000200_chapter_read_receipts con el procedimiento de migraciones del proyecto.

| Feature | Etapa | Agente | Resultado y validación |
| --- | --- | --- | --- |
| Biblioteca y actividad | Plan/contratos | planner, architect | Contratos y decisiones documentados |
| Eventos y persistencia | Implementación | db | Recibos aditivos; generate, validate y build correctos |
| API y seguimiento | Implementación | dev | Rutas, service, controller y Joi; build correcto |
| Integración | Documentación/revisión | root, reviewer, security | API/OpenAPI actualizadas; revisión estática sin bloqueantes |

Etapas omitidas: test por instrucción del usuario; media porque no hay uploads. Aceptación estática de los criterios siguientes completada; comportamiento real en PostgreSQL no verificado, migración no aplicada y QA no integrado.

## Criterios de aceptación

1. Visita explícita e inicio de lectura registran eventos idempotentes; GET catálogo no cambia datos.
2. Registrado: evento y estado leído se confirman juntos; contribución máxima capítulo/día local, relectura otro día válida. Anónimo: solo evento público.
3. Marcar/desmarcar previos a cuenta modifica estado sin incrementar calendario, racha ni conteo de actividad.
4. Favoritos y puntuaciones únicas e idempotentes; 0 válido y media ausente null.
5. Consultas /me usan identidad autenticada; progreso, historial y favoritos solo exponen publicados/no eliminados.
6. Calendario inclusivo <=366 días, page/limit acotados, ventanas24h móviles y rachas zona User; separar markedReadChapters y recordedReads.
7. Respeta capas, cliente PostgreSQL compartido, AppError/handlers/loggers; sin dependencias ni uploads; migración aditiva de recibos entregada sin aplicar.
8. Build y validación schema tienen resultado real registrado; tests N/D por petición usuario; revisión independiente completada antes de cierre.

