<!--
Sync Impact Report — material temporal de revisión; retirar antes del commit.
Versión: plantilla sin versión ratificada → 1.0.0 (constitución inicial).
Principios: cinco espacios genéricos sustituidos por nueve principios del proyecto:
I. Propósito; II. Evolución incremental; III. Capas; IV. Identidad y permisos;
V. Persistencia; VI. Multimedia; VII. Lectura; VIII. Comunidad; IX. Contratos y evidencia.
Secciones añadidas: contexto y restricciones; flujo de desarrollo; gobernanza y fuentes.
Secciones eliminadas: ninguna sección normativa previa; se retiran ejemplos de plantilla.
Plantillas y comandos dependientes: sin cambios; leen la constitución en ejecución.
Pendientes de plantilla: ninguno.
Discrepancias registradas: pruebas disponibles; conservación de Blob; permisos de catálogo;
descripciones históricas del modelo y funcionalidades de negocio propuestas.
Alcance: solo .specify/memory/constitution.md; sin implementación ni migraciones.
-->

# ModoFriki-Backend Constitution

## Core Principles

### I. Propósito: publicar, descubrir y leer narrativa gráfica

MODO FRIKI es una plataforma web de publicación y lectura de cómics, manga, manhwa y manhua.
El backend DEBE sostener un catálogo de obras y capítulos, la publicación por personal
autorizado, la lectura pública del contenido publicado, la biblioteca personal,
el descubrimiento y una comunidad moderada.

Cada feature DEBE identificar qué necesidad de lectores, editores o administradores resuelve
y expresar criterios de aceptación observables. Publicar NO DEBE convertirse en un permiso
implícito de cualquier cuenta registrada. Los tipos de obra y géneros DEBEN reutilizar
las taxonomías existentes.

La propuesta de autores independientes latinoamericanos y monetización de Obsidian
DEBE tratarse como dirección de negocio por validar. Friki+, pagos, anuncios, reparto
de ingresos y aprobación de solicitudes de autores requieren especificaciones propias.
Esta constitución NO los convierte en funcionalidades implementadas ni fija precios,
porcentajes, exclusividad de catálogo o condiciones comerciales.

### II. Evolución incremental de un backend existente

Antes de cambiar código, el responsable DEBE inspeccionar `package.json`, `tsconfig.json`,
`prisma/schema.prisma`, `prisma.config.ts`, `src/config/database/`, `src/config/env.ts`,
`src/app.ts`, `src/index.ts`, las rutas y los handlers, middlewares y utilidades afectados.
DEBE identificar los scripts disponibles y reutilizar convenciones, clientes y dependencias.

Se DEBEN preservar las configuraciones funcionales y TypeScript estricto.
NO se permite regenerar el proyecto, sustituir su arquitectura ni reorganizar carpetas
como efecto lateral de una feature. Una dependencia o abstracción nueva DEBE justificar
qué necesidad concreta no cubren las piezas existentes.

ElQuenta/TankoBase y la documentación externa son referencias evaluables. NO prueban
qué existe en este checkout ni autorizan copiar implementaciones sin comprobar contratos.

### III. Monolito con responsabilidades por capa

El flujo obligatorio es Routes → Controllers → Services → Repositories, con middlewares
para los aspectos HTTP y multimedia. Los dominios actuales son `auth`, `catalog`,
`community`, `reading` y `discovery`.

- Routes DEBEN declarar endpoints y ordenar middlewares; NO consultan datos ni implementan negocio.
- Controllers DEBEN extraer entradas e identidad de la petición, invocar Services y usar
  los handlers existentes; NO usan Prisma ni Mongoose directamente.
- Services DEBEN aplicar reglas, permisos e invariantes y coordinar repositorios mediante
  contratos tipados. NO dependen de `Request`/`Response` ni ejecutan operaciones Blob.
- Repositories DEBEN encapsular persistencia y transacciones mediante clientes compartidos.
  NO conocen Express. Pueden reforzar permisos e invariantes dentro de la transacción
  para impedir carreras entre comprobación y escritura.
- Models DEBEN contener schemas Mongoose cuando corresponda. Las validaciones DEBEN
  reutilizar Joi y las ubicaciones existentes, incluidos `src/middlewares/schemas/`.
- Config DEBE centralizar entorno y conexiones. Los tipos compartidos DEBEN conservar
  contratos explícitos; las factories e inyección existentes permiten aislar proveedores.

Solo se crean carpetas cuando la feature las necesita. Microservicios, otro framework
o una reorganización por módulos requieren una decisión estructural documentada.

### IV. Identidad vigente y autorización por recurso

PostgreSQL es la autoridad de identidad, estado y permisos. El registro público
DEBE crear cuentas `BASIC`/`ACTIVE` e impedir asignar privilegios desde el body.
Las contraseñas DEBEN almacenarse con bcrypt y nunca devolverse ni registrarse.

Cada petición autenticada DEBE validar el JWT según la política existente, consultar
la cuenta vigente y rechazar usuarios suspendidos o eliminados. El rol del token NO
sustituye al rol actual en base. La autenticación opcional permite ausencia de token;
un token presentado e inválido DEBE producir 401.

- Visitantes pueden consultar publicaciones; las cuentas activas pueden gestionar
  su propia biblioteca, valorar y participar en comunidad.
- `EDITOR` solo puede gestionar obras y capítulos con asignación vigente. El rol por sí
  solo NO autoriza acceso a obras ajenas ni moderación de comentarios de terceros.
- `ADMIN` crea obras y taxonomías y administra permisos y moderación según contrato.
  Cambios de rol y asignación DEBEN preservar la trazabilidad de `AdminAuditEvent`.
- Los endpoints personales DEBEN derivar la identidad de la sesión, nunca de un `userId`
  arbitrario enviado por el cliente.

Todo endpoint sensible DEBE comprobar permiso y recurso antes de efectos externos y
revalidar condiciones susceptibles de cambiar antes de confirmar. Las respuestas
públicas NO DEBEN revelar recursos ocultos; corresponde 404 según el contrato.
La proyección pública de usuarios DEBE excluir email y hash; los DTO privados de la
propia cuenta pueden incluir el email previsto en el contrato.

### V. Una fuente de verdad por dato y conservación del historial

PostgreSQL mediante Prisma DEBE ser la fuente de verdad de usuarios, permisos, catálogo,
capítulos, referencias multimedia, biblioteca y actividad. MongoDB mediante Mongoose
DEBE ser la fuente de verdad de comentarios, respuestas, votos y reportes. Los bytes
de imágenes pertenecen a Vercel Blob; las bases guardan referencias y metadatos.
NO se permite duplicar entidades autoritativas para suplir la caída de otro proveedor.

Las entidades nuevas del dominio DEBEN mantener UUID coherentes entre bases, relaciones,
unicidad e índices adecuados a sus consultas. El modelo heredado `Example` conserva su
compatibilidad. Las restricciones SQL adicionales, incluidos CHECK e índices parciales,
DEBEN preservarse aunque no estén expresadas completamente en el schema Prisma.

Las operaciones relacionadas dentro de PostgreSQL DEBEN ser atómicas cuando sus invariantes
lo requieran. NO existe transacción distribuida entre PostgreSQL, MongoDB y Blob;
cada coordinación DEBE definir fallos parciales y recuperación verificable.

Usuarios, obras, capítulos y comentarios DEBEN retirarse mediante borrado lógico,
conservando identidad, eventos e hilos. Desvincular páginas o sustituir relaciones
auxiliares dentro de una operación acotada NO autoriza purgar el historial.
Las ediciones concurrentes DEBEN usar las precondiciones existentes (`expectedUpdatedAt`,
`expectedVersion`, `expectedRevision`) y responder 409 ante versiones obsoletas.

### VI. Pipeline multimedia seguro y recuperación explícita

Toda subida DEBE seguir este orden: autenticación → autorización y verificación previa
del recurso → recepción Multer → validación de campos y archivos → middleware Blob →
Controller → Service → Repository. El Service puede preparar el plan de carga;
las operaciones `put`, `copy` y `del` pertenecen a middlewares.

Los metadatos DEBEN entregarse tipados mediante `res.locals.uploadedMedia`, incluyendo
`url`, `pathname`, `contentType` y `size` según el contrato vigente. NO se aceptan rutas,
URLs ni metadatos del cliente como prueba de propiedad de un archivo.

- Multer DEBE imponer límites explícitos. La política actual permite JPEG, PNG y WebP,
  hasta 10 MiB por archivo, 100 MiB por petición, 100 páginas por petición y 1000 por capítulo.
- La validación DEBE comprobar contenido y estructura admitida; el MIME declarado no basta.
  Los nombres y rutas DEBEN generarse y validarse en servidor sin sobrescribir activos.
- Las cargas DEBEN usar temporales o streaming acotados como el pipeline existente;
  NO se permite `memoryStorage` sin límites. Los temporales locales DEBEN retirarse
  al terminar o interrumpirse la petición.
- Los lotes y objetos DEBEN registrar reservas, subida y confirmación. Un fallo de
  persistencia DEBE abandonar el lote y conservar evidencia para recuperación.

La política vigente conserva archivos Blob ante fallos, abandono, vencimiento, cambio
de portada y baja lógica. Solo se borran archivos de la generación de páginas sustituida,
después de confirmar la nueva generación y comprobar pertenencia y ausencia de referencias.
Un fallo de ese borrado NO revierte la versión confirmada; se registra sin datos sensibles.
NO hay limpieza periódica ni reintentos programados. Introducirlos requiere una feature
explícita; los modelos históricos de cleanup NO autorizan ejecutarlos.

Una obra publicada DEBE tener portada. Un capítulo publicado DEBE tener páginas válidas
y pertenecer a una obra publicada. Ocultar borradores en la API NO vuelve privadas sus
URLs en el almacén Blob público: cualquier requisito de confidencialidad de imágenes
DEBE especificar y validar un mecanismo adicional antes de prometerlo.

### VII. Lectura y descubrimiento con métricas reproducibles

Las consultas GET NO DEBEN registrar visitas, lecturas ni modificar progreso. Visitas
y aperturas de capítulo se registran mediante operaciones explícitas con clave UUID
de idempotencia. Reintentar una operación NO DEBE duplicar su contribución; reutilizar
la clave para otro destino o identidad DEBE producir conflicto.

Las lecturas registradas DEBEN deduplicarse por usuario, capítulo y día local, con hora
del servidor y zona IANA vigente de la cuenta. La fecha local y zona del evento DEBEN
conservarse; cambiar zona NO reinterpreta el pasado. Las lecturas anónimas cuentan
para estadísticas públicas, sin generar biblioteca ni rachas personales.

Marcar o desmarcar manualmente DEBE modificar solo el estado personal; NO fabrica
actividad, elimina eventos ni altera retroactivamente rachas. Favoritos, valoraciones
y progreso DEBEN respetar unicidad, identidad propia y disponibilidad del catálogo.
Las puntuaciones DEBEN mantener la conversión contractual entre estrellas públicas
y medias estrellas persistidas.

Una apertura reportada NO prueba lectura completa, tiempo de lectura ni una persona
única. Rankings, novedades y recomendaciones DEBEN explicitar su criterio y filtrar
contenido no publicado o retirado. Las consultas DEBEN estar acotadas, ordenar de forma
determinista y agregar en base cuando corresponda, sin cargar historiales ilimitados
en memoria. Un futuro reparto económico requiere reglas y controles propios.

### VIII. Comunidad moderada con integridad de conversaciones

Los comentarios DEBEN referenciar una obra o capítulo existente y publicado, validado
contra PostgreSQL. Las respuestas DEBEN conservar destino, padre y raíz coherentes.
Los hilos se almacenan como documentos independientes y se consultan de forma paginada;
NO se embeben árboles sin límite en un único documento.

Editar requiere autoría y revisión vigente. Borrar DEBE conservar el nodo y descendientes
y retirar el texto según la política existente. Cada usuario tiene como máximo un voto
y un reporte por comentario. Los listados DEBEN preservar la paginación por cursor
y restringir datos de reporteros y moderación a sus destinatarios autorizados.

Solo `ADMIN` puede moderar comentarios ajenos y resolver reportes. Una resolución DEBE
registrar una explicación; resolver un reporte NO elimina automáticamente el comentario.
El Markdown es entrada no confiable; el contrato de integración DEBE exigir sanitización
al renderizar. Una referencia entre bases NO equivale a una FK distribuida.

### IX. Contratos compatibles y evidencia de calidad

Cada cambio de API DEBE mantener alineados implementación, `docs/API.md`, `openapi.yaml`
y el plan de feature. El frontend se desarrolla en otro repositorio; los cambios
incompatibles DEBEN acordarse expresamente con el responsable del producto antes de integrarse.
Se DEBEN reutilizar `AppError`, handlers y códigos HTTP existentes, manteniendo respuestas
JSON y errores internos seguros. Las formas de paginación DEBEN respetar el contrato
de cada dominio; NO se impone una envoltura nueva a endpoints existentes.

Se DEBEN validar entradas y rechazar campos privilegiados o desconocidos según los schemas.
Los logs DEBEN identificar operación y fallo sin credenciales, passwords, hashes,
tokens, cabeceras Authorization, cuerpos sensibles ni URI completas de conexión.
Las consultas SQL DEBEN parametrizarse; NO se concatenan entradas no confiables.

Las verificaciones DEBEN corresponder al riesgo real: reglas de negocio y permisos,
casos negativos, concurrencia, idempotencia y fallos parciales cuando estén afectados.
Las pruebas unitarias con mocks NO demuestran integración con proveedores reales.
Nadie DEBE afirmar que una prueba, migración o despliegue se ejecutó sin evidencia.

## Contexto y restricciones del producto

- Stack vigente: Node.js, Express y TypeScript estricto; PostgreSQL/Prisma,
  MongoDB/Mongoose, Joi, Multer, Vercel Blob, JWT, bcrypt y Winston. Vitest es la
  herramienta de pruebas disponible. Se reutilizan clientes de `src/config/database/`.
- Los dominios implementados son autenticación, catálogo/publicación, comunidad,
  biblioteca/actividad y descubrimiento. Un modelo o nota de diseño por sí solos
  NO prueban que exista un endpoint, worker, panel o proceso operativo.
- La configuración DEBE pasar por `src/config/env.ts` y `prisma.config.ts`, según corresponda.
  NO se modifican `.env` ni se exponen secretos. El cliente Prisma se genera en
  `src/generated/prisma/`; NO se edita manualmente.
- Las migraciones nuevas DEBEN ser aditivas y revisables, preparadas mediante SQL o diff
  evaluado y desplegadas por el procedimiento aprobado. La base compartida NO admite
  `migrate dev`, `migrate reset` ni `db push` como reconciliación.
  El script `prisma:migrate` existente NO autoriza a usarlo allí.
- Antes de aplicar migraciones DEBEN verificarse destino, historial, drift, restricciones,
  respaldo restaurable y resultado en un entorno desechable. Una discrepancia de baseline
  exige reconciliación específica; NO se marca una migración como aplicada para ocultarla.
  DROP, purgas, borrados masivos y migraciones irreversibles requieren autorización humana.
- El catálogo DEBE publicarse con autorización de titulares o licencia correspondiente.
  Una incorporación de autores, clasificación por edad o monetización DEBE definir
  derechos, privacidad, moderación y responsabilidades en su especificación. Esta regla
  NO certifica que existan hoy flujos técnicos de consentimiento o licencias.

## Flujo de desarrollo y controles de calidad

1. **Inspección y especificación.** Definir objetivo, actores, alcance, exclusiones,
   criterios de aceptación y estado real del código. En Spec Kit, `spec.md`, `plan.md`
   y `tasks.md` DEBEN comprobar esta constitución; los planes de `docs/features/`
   siguen siendo contexto del dominio y registro de entregas.
2. **Contratos antes de implementar.** Acordar API, permisos, fuente de verdad,
   invariantes transaccionales, pipeline y recuperación. Registrar una decisión
   cuando cambien varias capas, proveedores o contratos.
3. **Responsabilidad y colaboración.** Seguir `AGENTS.md` y `docs/agents/WORKFLOW.md`
   cuando se use el flujo con agentes. Antes de delegar, definir criterios, dependencias,
   archivos propios y rama/worktree. Los subagentes comparten directorio: NO son sesiones
   aisladas. Escrituras coincidentes DEBEN secuenciarse; el aislamiento real exige
   sesiones independientes en worktrees distintos. Los revisores son de solo lectura
   y devuelven hallazgos al propietario; los trabajadores NO integran por su cuenta.
4. **Validación proporcional.** Para código TypeScript ejecutar `npm run build` y las
   pruebas pertinentes con `npm test`. Para persistencia añadir `npm run prisma:validate`
   y generar cliente mediante `npm run prisma:generate` si cambió el schema. La aceptación
   de SQL, restricciones o carreras requiere pruebas en PostgreSQL desechable;
   MongoDB y Blob reales solo se verifican en entornos de prueba identificados.
   Una edición documental exige comprobar consistencia, enlaces locales, versión,
   fechas y ausencia de marcadores pendientes; NO necesita ejecutar aplicación o bases.
5. **Revisión e integración.** Revisar diff y riesgos; auth, permisos y uploads
   requieren revisión de seguridad acorde al cambio. NO hacer commits directos a
   `main` o `QA`, ni force-push compartido, ni `reset --hard` para descartar trabajo ajeno.
   Integrar en QA requiere revisión, validaciones y aprobación humana explícita.
6. **Entrega verificable.** Informar objetivo y resultado, archivos inspeccionados o
   modificados, decisiones, comandos y resultados reales, riesgos y pendientes,
   rama y SHA cuando existan. Registrar expresamente comprobaciones no ejecutadas.

`package.json` ofrece hoy build, test y scripts Prisma; NO ofrece lint. Antes de cada
entrega se DEBE volver a inspeccionar la disponibilidad real. Las limitaciones de entorno
se documentan con su impacto; compilar NO reemplaza probar comportamiento.

## Governance

Esta constitución establece los criterios duraderos del proyecto y se interpreta junto
con las instrucciones explícitas vigentes del usuario y `AGENTS.md`. Las notas históricas,
los ejemplos de plantillas y las propuestas del vault NO la enmiendan automáticamente.
Las palabras DEBE, NO DEBE y NO se permite expresan requisitos comprobables.

Una enmienda DEBE documentar motivo, reglas afectadas, impacto en contratos y datos,
alternativas, validaciones y transición cuando corresponda. El responsable del proyecto
DEBE aprobar cambios normativos antes de integrarlos. Toda revisión de feature
DEBE identificar incumplimientos y corregirlos o proponer una excepción explícita,
acotada y aprobada, con responsable y criterio de cierre. La deuda existente se registra;
NO justifica ampliarla ni obliga a una reescritura ajena al alcance.

El versionado es semántico: MAJOR para eliminar o redefinir principios de forma
incompatible; MINOR para nuevos principios o ampliaciones normativas compatibles;
PATCH para aclaraciones sin cambio de obligación. Cada enmienda DEBE actualizar versión
y fecha y preservar la ratificación original. La versión 1.0.0 es la primera constitución.

### Fuentes y tratamiento de discrepancias

Esta redacción se basa en `AGENTS.md`, `docs/agents/WORKFLOW.md`, `docs/API.md`,
`docs/features/`, `prisma/README.md`, schema, migraciones, configuración y capas existentes.
También se consultaron dominio, arquitectura, decisiones, negocio y mejoras de
[ModoFriki-Obsidian](https://github.com/alanmcv/ModoFriki-Obsidian/tree/8cbd099705946a419deddb2571a535a9c5891cf0),
revisión `8cbd099705946a419deddb2571a535a9c5891cf0`, consultada el 2026-10-29.

Para describir el comportamiento actual se DEBEN contrastar documentos con código,
schema y contrato específico más reciente. Una contradicción normativa que afecta
permisos, datos o compatibilidad DEBE registrarse y resolverse explícitamente antes
de cambiar comportamiento; NO se corrige silenciosamente desde otra tarea.
El código NO demuestra que sus migraciones estén aplicadas ni valida el despliegue.

Discrepancias conocidas que esta constitución evita perpetuar:

- Algunas evaluaciones y planes históricos indican ausencia de pruebas. Hoy existen
  Vitest, `npm test` y tests; esos diagnósticos describen otra etapa.
- `prisma/README.md` y diseños históricos describen servicios futuros y limpieza durable.
  La política posterior de `docs/features/works-chapters.md`, `docs/API.md` y el pipeline
  conserva Blob salvo páginas sustituidas; los modelos cleanup no prueban un worker.
- DEC-11 y la matriz de roles de Obsidian reservan borrar capítulos a ADMIN; el modelo
  propuesto local también restringe editar obras. Los repositorios actuales permiten
  a EDITOR asignado editar obras y dar de baja obras y capítulos.
  Esta constitución conserva el alcance por asignación y no cambia esos endpoints.
  Antes de modificar permisos de catálogo se DEBE resolver y sincronizar esa discrepancia
  con el responsable del producto y el contrato del frontend.
- La sección histórica de persistencia de `docs/API.md` menciona `Tag`, `pages String[]`
  y rutas Blob antiguas; la referencia técnica actual es el schema real, `ChapterPage`,
  `MediaAsset` y la sección de catálogo implementado. NO se crean entidades basándose
  únicamente en esa descripción antigua.
- Mejoras de arranque, health check, protección contra abuso, almacenamiento privado
  y pruebas reales de integración requieren comprobación específica. NO se presentan
  como garantías operativas por aparecer en documentación.

Cada enmienda DEBE incluir un informe de impacto para revisión. El informe HTML inicial
es material temporal y DEBE retirarse antes del commit. Las plantillas y comandos
dependientes leen la constitución al ejecutarse; este trabajo NO modifica sus fuentes
ni implementa las propuestas mencionadas.

**Version**: 1.0.0 | **Ratified**: 2026-10-29 | **Last Amended**: 2026-10-29
