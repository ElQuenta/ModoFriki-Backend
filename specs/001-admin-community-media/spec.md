# Feature Specification: Administración segura, sanciones e imágenes de obras

**Feature Branch**: `dev` (rama actual; no se creó una rama nueva)

**Created**: 2026-10-29

**Status**: Draft

**Input**: Resolver la deuda técnica descrita por el usuario: listar usuarios con sus roles y administrar roles sin permitir que un administrador cree, degrade o elimine administradores; suspender temporal o permanentemente la creación de comentarios y revocar sanciones; disponer de portada, banner de obra e imagen inicial de capítulo como tres imágenes independientes por obra. Tras la aclaración, el cierre de cada capítulo será una página ordinaria opcional subida por su editor, sin imagen final global ni recurso de cierre independiente.

**Estado comprobado**: El código local admite dos imágenes de obra, `cover` e `inpagecover`; el detalle de capítulo devuelve sus páginas sin componer la apertura. Existen autenticación, guard de roles, asignaciones y auditoría modeladas, pero no rutas administrativas de usuarios, asignaciones o sanciones. Los requisitos siguientes describen el comportamiento objetivo, no capacidades ya entregadas. Se contrastaron con la constitución 1.0.0 y el vault local `../ModoFriki-Obsidian`, revisión `8cbd099705946a419deddb2571a535a9c5891cf0`.

## Clarifications

### Session 2026-10-29

- Q: ¿Esta feature debe permitir que ADMIN asigne y revoque obras a los usuarios EDITOR? → A: Sí; incluir asignación y revocación de obras, exclusivamente por ADMIN y con auditoría.
- Q: ¿Cómo deben aplicarse las sanciones de comentarios a las cuentas ADMIN? → A: Solo se puede sancionar a BASIC y EDITOR; ADMIN queda excluido.
- Q: ¿Qué debe pasar con un comentario que el usuario estaba enviando cuando se confirma su sanción, pero que todavía no se ha guardado? → A: Rechazar también los comentarios pendientes de guardar cuando se confirma la sanción; la misma regla se aplica a las respuestas.
- Q: ¿Las nuevas obras deben tener portada, banner de ficha e imagen inicial de capítulo para poder publicarse? → A: Sí; las nuevas publicaciones requieren las tres imágenes y las obras ya publicadas pueden completarlas después sin perder disponibilidad.
- Q: ¿Para sancionar a un usuario debe ser obligatorio vincular un comentario o reporte concreto? → A: El motivo es obligatorio; el vínculo a un comentario o reporte es opcional.
- Q: ¿ADMIN debe poder cambiar el rol entre BASIC y EDITOR de una cuenta suspendida? → A: Sí; permitir ambos cambios en cuentas activas o suspendidas, conservando su estado. La suspensión no se levanta por cambiar el rol.

**Correcciones aprobadas el 2026-10-29**: El usuario aprobó resolver C1, I1, U1, G1, G2 e I2 del análisis: revalidación del destino al confirmar comentarios, suites de prueba separadas, restricciones explícitas de estados/fechas, refresco de paginación sin instantánea, evidencia de aceptación del consumidor y actualización de la nota histórica de banners. Esta aprobación corresponde a los documentos de diseño y tareas; no certifica implementación ni despliegue.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administrar roles protegiendo las cuentas administradoras (Priority: P1)

Como ADMIN quiero consultar los usuarios y sus roles, cambiar una cuenta entre BASIC y EDITOR y asignar o revocar obras a los editores, conservando la protección de las cuentas ADMIN para impedir que otro administrador concentre el control mediante promociones, degradaciones o eliminaciones.

**Why this priority**: Habilita la gestión pendiente y limita el abuso de los permisos administrativos.

**Independent Test**: Con cuentas de los tres roles, recorrer el listado y probar cambios permitidos y prohibidos, incluso con sesiones abiertas antes del cambio.

**Acceptance Scenarios**:

1. **Given** un ADMIN activo, **When** recorre las páginas del listado, **Then** obtiene todas las cuentas no eliminadas, incluidos los ADMIN, con identificador, nombre de usuario, rol y estado, sin credenciales ni datos internos de autenticación.
2. **Given** una cuenta BASIC activa, **When** ADMIN la cambia a EDITOR, **Then** se guarda el rol y queda registrado quién lo cambió, cuándo y cuál era el anterior.
3. **Given** una cuenta EDITOR, **When** ADMIN la cambia a BASIC, **Then** sus siguientes operaciones protegidas usan BASIC aunque la sesión sea anterior; sus asignaciones editoriales se revocan y no se reactivan si vuelve a EDITOR.
4. **Given** cualquier cuenta, **When** ADMIN intenta asignarle ADMIN, **Then** se rechaza la operación sin cambios.
5. **Given** una cuenta ADMIN, incluida la del solicitante, **When** se intenta cambiar su rol o eliminarla por una operación administrativa, **Then** se rechaza sin alterar su cuenta ni su acceso.
6. **Given** un visitante, BASIC o EDITOR, **When** intenta listar usuarios o administrar roles, **Then** no obtiene datos administrativos ni produce cambios.
7. **Given** dos administradores con una versión anterior de una cuenta, **When** intentan modificarla, **Then** una escritura obsoleta se rechaza sin sobrescribir silenciosamente el cambio confirmado.
8. **Given** una cuenta EDITOR activa y una obra no eliminada, **When** ADMIN le asigna explícitamente la obra, **Then** puede gestionar esa obra según los permisos de catálogo existentes y queda registrada la asignación con responsable y fecha; no obtiene permisos sobre otras obras.
9. **Given** una asignación vigente, **When** ADMIN la revoca, **Then** la siguiente operación editorial sobre esa obra se rechaza y se conserva el historial con responsable y fecha.
10. **Given** una cuenta promovida nuevamente de BASIC a EDITOR, **When** ADMIN vuelve a asignarle explícitamente una obra antes revocada, **Then** recupera acceso solo a esa obra mediante la nueva asignación auditada.
11. **Given** un visitante, BASIC o EDITOR, **When** intenta asignar o revocar una obra, **Then** se rechaza sin cambios; tampoco se permite asignar obras a una cuenta que no sea EDITOR activa ni a una obra eliminada o inexistente.
12. **Given** un ADMIN activo y una cuenta EDITOR, **When** ADMIN consulta las asignaciones paginadas del editor, **Then** puede identificar las obras con asignación vigente y verificar el resultado de una asignación o revocación sin acceder directamente a la persistencia.
13. **Given** una cuenta BASIC con estado SUSPENDED, **When** un ADMIN activo la cambia a EDITOR, **Then** el cambio queda auditado y la cuenta conserva SUSPENDED: no puede autenticarse, actuar como editor ni recibir nuevas asignaciones mientras siga suspendida.
14. **Given** una cuenta EDITOR con estado SUSPENDED y asignaciones vigentes, **When** un ADMIN activo la cambia a BASIC, **Then** el cambio y la revocación de sus asignaciones quedan auditados y confirmados juntos; la cuenta sigue SUSPENDED.
15. **Given** una cuenta BASIC o EDITOR con estado ACTIVE, **When** un ADMIN activo cambia su rol al otro permitido, **Then** conserva ACTIVE y cualquier sanción de comentarios vigente mantiene sus fechas y condiciones.

---

### User Story 2 - Suspender y restituir la capacidad de comentar (Priority: P1)

Como ADMIN quiero impedir que una cuenta cree comentarios o respuestas hasta una fecha determinada o permanentemente y poder revocar la sanción, sin suspender toda su cuenta.

**Why this priority**: Permite moderar el abuso reiterado preservando la lectura y el resto de actividades legítimas.

**Independent Test**: Aplicar sanciones temporales y permanentes y revocarlas; intentar crear comentarios y respuestas antes, durante y después de cada estado.

**Acceptance Scenarios**:

1. **Given** una cuenta sin sanción vigente, **When** ADMIN impone una sanción con motivo y fin futuro, **Then** no puede crear comentarios ni respuestas desde la confirmación hasta esa fecha.
2. **Given** una sanción temporal vigente, **When** se alcanza exactamente su fecha de fin, **Then** la siguiente creación válida vuelve a permitirse sin intervención administrativa.
3. **Given** una cuenta sin sanción vigente, **When** ADMIN impone una sanción permanente con motivo, **Then** el bloqueo no caduca con el paso del tiempo.
4. **Given** una sanción vigente, **When** ADMIN la revoca, **Then** la siguiente creación válida se permite y se conservan la sanción y los datos de su revocación.
5. **Given** una cuenta sancionada únicamente para comentar, **When** inicia sesión, lee, vota, reporta, edita o retira un comentario propio, **Then** mantiene los permisos ordinarios de esas acciones; no se elimina contenido previo.
6. **Given** BASIC o EDITOR, **When** intenta imponer o revocar una sanción, incluso la propia, **Then** se rechaza sin cambios.
7. **Given** una fecha inválida, pasada o igual al momento de imposición, o un motivo vacío, **When** ADMIN intenta sancionar, **Then** se rechaza sin crear una sanción parcial.
8. **Given** una cuenta con sanción vigente, **When** se intenta imponer otra, **Then** se informa un conflicto; para cambiarla se debe revocar la vigente e imponer otra, conservando el historial.
9. **Given** una cuenta ADMIN, incluida la del solicitante, **When** otro ADMIN intenta imponerle una sanción de comentarios, **Then** se rechaza sin crear una sanción ni alterar su capacidad de comentar o sus permisos administrativos.
10. **Given** ADMIN, **When** consulta la moderación de una cuenta, **Then** distingue sanciones vigentes, vencidas y revocadas, con motivo, responsables y fechas; el usuario afectado puede conocer su propia restricción vigente sin acceder al historial privado de terceros.
11. **Given** un comentario o respuesta en curso que aún no se ha guardado, **When** se confirma una sanción vigente para su autor antes de guardarlo, **Then** se rechaza la creación aunque el envío se hubiera autorizado antes de la sanción, sin publicar el contenido pendiente.
12. **Given** un comentario o respuesta ya guardado antes de confirmar la sanción, **When** la sanción entra en vigor, **Then** ese contenido se conserva conforme a las reglas ordinarias de moderación; la sanción no lo elimina retroactivamente.
13. **Given** una cuenta sancionable, **When** ADMIN impone una sanción con motivo válido sin vincular comentario ni reporte, **Then** puede confirmarse; también puede confirmarse con una referencia válida opcional relacionada con comentarios de esa cuenta.
14. **Given** una referencia de comentario o reporte inexistente o ajena a la cuenta afectada, **When** ADMIN intenta vincularla a la sanción, **Then** se rechaza sin confirmar una sanción parcial. Resolver un reporte no impone ni revoca sanciones automáticamente.
15. **Given** una sanción vigente, **When** su destinatario consulta su restricción o intenta crear un comentario, **Then** puede conocer el motivo y el fin o carácter permanente, sin recibir datos de reporteros ni datos personales de moderadores; el bloqueo es un rechazo de permiso y no invalida su sesión.
16. **Given** una creación aún pendiente de aceptación sobre obra o capítulo, **When** se confirma antes la despublicación o baja de su destino o de su obra padre, **Then** la creación se rechaza sin publicar el comentario y se informa recurso no disponible; si la creación se aceptó antes, la retirada posterior conserva su historial y aplica la visibilidad vigente del catálogo.
17. **Given** un provisional examinado y omitido durante la paginación, **When** se acepta después de haber avanzado su posición, **Then** el recorrido anterior no lo incorpora retroactivamente; al actualizar comentarios desde la primera página sin cursor puede aparecer según su orden y permisos vigentes.

---

### User Story 3 - Separar las imágenes de obra y entregar la apertura del capítulo (Priority: P2)

Como responsable de una obra quiero mantener portada, banner de ficha e imagen inicial común para sus capítulos, porque el formato de la apertura actual no sirve como banner. Como lector quiero recibir la apertura junto con las páginas del capítulo.

**Why this priority**: Corrige la mezcla de usos visuales incompatibles y evita otra consulta para construir la secuencia de lectura.

**Independent Test**: Cargar tres imágenes distintas y consultar la obra y dos capítulos, verificando funciones y orden sin depender de la administración de usuarios.

**Acceptance Scenarios**:

1. **Given** ADMIN creando una obra, **When** sube portada, banner de ficha e imagen inicial, **Then** se conservan tres referencias independientes y la consulta de la obra distingue sus funciones.
2. **Given** una obra con apertura y un capítulo con N páginas, **When** se obtiene el detalle del capítulo, **Then** se recibe una secuencia de N+1 imágenes: apertura una sola vez y las N páginas en su orden editorial. Portada y banner de ficha no aparecen en esa secuencia.
3. **Given** dos capítulos de la misma obra, **When** se consulta cada uno, **Then** ambos usan la imagen inicial vigente de la obra sin necesitar copias subidas por capítulo.
4. **Given** una obra con sus imágenes, **When** un responsable autorizado sustituye solo el banner o edita datos sin archivos, **Then** las demás referencias se conservan y la apertura no cambia.
5. **Given** una obra publicada antes de entrar en vigor el requisito de tres imágenes y que carece del nuevo banner, **When** se consulta la obra o sus capítulos, **Then** siguen disponibles según sus permisos, se informa la ausencia y no se usa la apertura como sustituto del banner.
6. **Given** una obra publicada antes de entrar en vigor el requisito y sin apertura, **When** se obtiene un capítulo, **Then** se entregan sus páginas sin una entrada vacía de apertura.
7. **Given** un EDITOR sin asignación vigente o BASIC, **When** intenta cambiar imágenes de la obra, **Then** se rechaza antes de subir archivos.
8. **Given** una apertura sustituida, **When** se consulta un capítulo existente, **Then** se entrega la nueva apertura conservando las páginas y su numeración editorial.
9. **Given** una obra que se publica por primera vez después de entrar en vigor el requisito, **When** falta portada, banner de ficha o apertura de capítulo, **Then** se rechaza la publicación y se conserva como borrador; cuando están las tres imágenes válidas puede publicarse si cumple los demás requisitos.
10. **Given** una obra en borrador, incluso creada antes de entrar en vigor el requisito pero nunca publicada, **When** se guarda con imágenes incompletas, **Then** puede permanecer en borrador, pero necesita las tres imágenes para su primera publicación.
11. **Given** una obra ya publicada antes del nuevo requisito y con banners pendientes, **When** se editan sus datos o se publican nuevos capítulos con páginas válidas, **Then** no se bloquean esas operaciones por los banners pendientes ni se obliga a reenviar imágenes existentes.

---

### User Story 4 - Añadir un mensaje final como página del capítulo (Priority: P2)

Como EDITOR asignado o ADMIN quiero subir una imagen con un mensaje propio al final de cada capítulo mediante las operaciones habituales de páginas.

**Why this priority**: Da autonomía editorial sin introducir configuración global ni otra clase de imagen.

**Independent Test**: Subir un capítulo con páginas y un mensaje final, consultar y reordenar sus páginas, comprobando el orden confirmado.

**Acceptance Scenarios**:

1. **Given** un capítulo con una imagen de mensaje colocada al final por el editor, **When** se consulta, **Then** aparece última, una sola vez y como una página más.
2. **Given** un capítulo sin mensaje final, **When** se publica o consulta, **Then** no se exige ni se añade automáticamente un cierre.
3. **Given** apertura de obra y página de cierre, **When** se consulta el capítulo, **Then** el orden es apertura, páginas del capítulo y, como última página ordinaria, el cierre colocado por el editor.
4. **Given** una página usada como cierre, **When** se reemplaza o reordena mediante las operaciones existentes, **Then** se aplican las mismas reglas de permisos, orden y concurrencia que a cualquier página; no se fuerza una posición especial.

### Edge Cases

- Un listado vacío devuelve una colección vacía. La paginación tiene límites y orden determinista para recorrer las cuentas sin devolver una colección ilimitada.
- Cuentas inexistentes o eliminadas no admiten cambios de rol ni nuevas sanciones. Vencer una sanción de comentarios no levanta una suspensión general de cuenta.
- Cambiar BASIC ↔ EDITOR conserva el estado ACTIVE o SUSPENDED del destinatario. El ADMIN que ejecuta el cambio debe estar activo. Promover una cuenta suspendida no la reactiva ni permite asignarle obras; degradarla revoca sus asignaciones con las mismas garantías que una cuenta activa. No se introduce un flujo de levantamiento de suspensión general.
- Solicitar el rol actual no crea cambios ficticios ni auditorías duplicadas. Revocar una sanción vencida o revocada devuelve su estado sin reactivarla ni alterar el historial.
- Una degradación, sus revocaciones editoriales y su historial se confirman juntos; un fallo no deja permisos modificados parcialmente.
- Cada asignación o revocación efectiva deja un registro identificable por obra y editor. Repetir una asignación vigente o revocación ya aplicada no duplica relaciones ni eventos; una reasignación explícita conserva el historial previo. Asignaciones concurrentes o simultáneas a una degradación deben mantener estos invariantes.
- La autorización usa el estado vigente, no datos recordados por una sesión anterior. Si la sanción se confirma antes de guardar un comentario o respuesta pendiente, se rechaza la creación, aunque hubiera sido autorizada previamente. Si el contenido ya estaba guardado antes de confirmar la sanción, se conserva. El plan debe demostrar ese orden de confirmación ante solicitudes concurrentes y definir recuperación verificable de fallos parciales entre proveedores, sin asumir una transacción distribuida ni permitir que aparezca contenido pendiente bloqueado.
- Si no se puede verificar la restricción vigente, no se permite crear comentarios ni respuestas.
- Las fechas representan un instante inequívoco; la sanción deja de estar vigente cuando la hora del sistema es mayor o igual al fin.
- La apertura no renumera páginas ni cuenta para sus límites. Un mensaje final ordinario sí cuenta como página para todos los límites.
- La excepción de imágenes incompletas corresponde a obras ya publicadas antes de entrar en vigor el requisito, no a cualquier obra creada antes. Los borradores nunca publicados deben completar las tres imágenes para su primera publicación; editar sin archivos conserva las referencias y no exige reenviarlas.
- Archivos inválidos, cantidades excesivas o ediciones obsoletas conservan la versión previa. Una carga o persistencia fallida no deja una publicación confirmada con referencias incompletas.
- Si falla la retirada de archivos de una generación sustituida, se mantiene la versión nueva confirmada y se registra el fallo según la política vigente, sin añadir limpieza automática.
- Imposiciones concurrentes no pueden dejar dos sanciones vigentes. Revocar identifica una sanción concreta: repetir una revocación antigua nunca revoca otra sanción posterior. Un vínculo de evidencia no exige copiar texto, conservar contenido borrado ni dar acceso público a reportes privados.
- Un comentario vinculado puede retirarse posteriormente con las reglas ordinarias sin borrar la sanción ni su historial. Una indisponibilidad al validar evidencia opcional aportada rechaza la operación sin tratarla como una referencia ausente ni producir una sanción parcial.
- Las consultas de capítulo y de moderación no registran lecturas, visitas ni cambios de progreso. La apertura se distingue de las páginas para evitar que los consumidores la añadan dos veces o desplacen su posición editorial guardada.
- La disponibilidad publicada del destino se revalida al confirmar el comentario y se coordina con las mutaciones de catálogo. Una retirada ganadora produce rechazo terminal y respuesta de recurso no disponible, sin deshacer ese rechazo por una republicación posterior.
- La paginación de comentarios no representa una instantánea ni asegura incorporar aceptaciones tardías detrás del cursor. Actualizar requiere reiniciar desde la primera página y sustituir la colección local; una página vacía no implica fin si hasMore indica continuación.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE ofrecer exclusivamente a ADMIN activo un listado paginado de todas las cuentas no eliminadas con identificador, nombre de usuario, rol y estado, sin contraseñas, hashes ni datos internos de autenticación.
- **FR-002**: Solo ADMIN activo DEBE poder cambiar roles entre BASIC y EDITOR en cuentas destinatarias ACTIVE o SUSPENDED no eliminadas. Ambos cambios DEBEN conservar el estado del destinatario: no levantan la suspensión, reactivan la cuenta ni alteran una sanción de comentarios vigente. La degradación de una cuenta suspendida DEBE revocar sus asignaciones igual que la de una activa; promoverla no habilita autenticación, actividad editorial ni nuevas asignaciones mientras siga suspendida. Las operaciones administrativas DEBEN verificar autenticación y rol vigente antes de acceder a datos o producir efectos y revalidar estas condiciones antes de confirmar.
- **FR-003**: La gestión administrativa DEBE impedir crear o promover cuentas ADMIN y cambiar el rol o eliminar cualquier cuenta ADMIN, incluida la propia. No se introduce un rol superior ni una vía alternativa de escalado. Esta protección corresponde a las operaciones del producto, no a accesos directos a infraestructura; el aprovisionamiento operativo existente de administradores queda fuera de la feature.
- **FR-004**: Cada cambio efectivo de rol DEBE registrar actor, cuenta, rol anterior, rol nuevo y fecha. Degradar EDITOR a BASIC DEBE revocar sus asignaciones vigentes de manera consistente con el cambio; una promoción posterior no las restaura.
- **FR-005**: Las operaciones posteriores DEBEN usar el nuevo rol sin cerrar sesión. Las escrituras concurrentes obsoletas DEBEN rechazarse y una solicitud al rol actual no debe producir cambios ni auditorías ficticias.
- **FR-006**: Solo ADMIN activo DEBE imponer y revocar sanciones de comentarios. Solo las cuentas BASIC y EDITOR no eliminadas pueden ser destinatarias; cualquier intento de sancionar una cuenta ADMIN, incluida la propia, DEBE rechazarse sin efectos. El rol del destinatario DEBE verificarse de nuevo antes de confirmar la imposición. Cada sanción DEBE identificar cuenta, responsable, motivo no vacío, inicio y fin futuro o carácter permanente. Puede incluir opcionalmente una referencia a un comentario de la cuenta afectada o a un reporte sobre uno de sus comentarios; si se proporciona, DEBE validarse su existencia y correspondencia. No se exige reporte previo ni se sanciona automáticamente al resolverlo.
- **FR-007**: Una sanción vigente DEBE impedir crear comentarios y respuestas sobre toda obra o capítulo, incluidas respuestas anidadas, por todos los caminos de creación y con sesiones existentes. El bloqueo DEBE alcanzar los envíos en curso aún no guardados al confirmar la sanción, incluso si se autorizaron antes; esos envíos DEBEN rechazarse sin publicar contenido. Los comentarios o respuestas guardados antes de confirmar la sanción se conservan.
- **FR-008**: La sanción temporal DEBE dejar de bloquear desde su instante de fin; la permanente solo por revocación. Como máximo puede existir una sanción vigente por cuenta y otra imposición debe rechazarse por conflicto.
- **FR-009**: Revocar DEBE identificar la sanción concreta, conservarla y registrar responsable y fecha de revocación. Repetir la revocación no altera el resultado, duplica eventos ni revoca sanciones posteriores. Imposiciones concurrentes DEBEN respetar la unicidad de sanción vigente.
- **FR-010**: La sanción DEBE afectar únicamente a crear comentarios y respuestas de BASIC y EDITOR. No suspende cuentas, elimina contenido, revoca roles ni sustituye otras restricciones. Las cuentas ADMIN quedan excluidas de estas sanciones.
- **FR-011**: ADMIN DEBE consultar el estado e historial de sanciones por cuenta de forma paginada, acotada y con orden estable. Una cuenta autenticada DEBE conocer su propia restricción vigente, motivo y fin o carácter permanente; el historial y las referencias de reportes quedan restringidos a ADMIN. La proyección propia no DEBE revelar reporteros ni datos personales de moderadores. El rechazo por sanción DEBE distinguirse de una autenticación inválida sin cerrar una sesión válida.
- **FR-012**: El sistema DEBE rechazar fechas inválidas o no futuras y operaciones sobre cuentas inexistentes o eliminadas. Si no puede verificar la sanción vigente, DEBE impedir nuevas creaciones de comentarios y respuestas. Antes de aceptar una creación DEBE revalidar que la obra y, cuando corresponda, el capítulo sigan publicados, no eliminados y correctamente relacionados. Si la retirada del destino se confirmó antes, DEBE rechazar la creación sin publicar contenido y responder recurso no disponible, conservando la decisión de rechazo.
- **FR-013**: Cada obra DEBE admitir portada, banner de ficha y apertura compartida de capítulos como tres imágenes independientes. La apertura actual conserva su función y no se convierte automáticamente en banner de ficha.
- **FR-014**: ADMIN y EDITOR con asignación vigente DEBEN cargar o sustituir esas imágenes con los permisos de edición actuales; omitir un archivo al editar conserva su referencia. Crear obras sigue reservado a ADMIN.
- **FR-015**: El detalle de capítulo DEBE incluir una secuencia de lectura con apertura vigente de su obra, cuando exista, seguida de todas sus páginas en orden, sin duplicaciones introducidas por la composición ni otra consulta de obra para obtener la apertura.
- **FR-016**: La apertura DEBE distinguirse de las páginas editoriales y no alterar numeración, recuentos ni límites. Portada y banner de ficha no forman parte de la secuencia de lectura.
- **FR-017**: Los mensajes finales DEBEN admitirse opcionalmente como páginas ordinarias, sin campo especial, recurso de cierre ni inserción automática. Su posición depende del orden editorial confirmado y cuentan para los límites de páginas.
- **FR-018**: La primera publicación de una obra tras entrar en vigor el nuevo requisito DEBE exigir portada, banner de ficha e imagen inicial de capítulo válidos, incluidos los borradores anteriores nunca publicados. Una obra en borrador puede guardarse con imágenes incompletas. Las obras ya publicadas antes del requisito DEBEN conservar disponibilidad, referencias y capacidad de edición y publicación de capítulos aunque aún no tengan ambos banners; podrán completarlos después sin bloqueo retroactivo. Su ausencia DEBE representarse explícitamente y omitirse en la secuencia de lectura sin imágenes vacías. Editar no exige reenviar archivos ya guardados. Los capítulos publicados siguen requiriendo páginas válidas y obra publicada; el cierre como página ordinaria sigue siendo opcional.
- **FR-019**: Las cargas DEBEN cumplir validaciones, límites, permisos previos y controles de concurrencia existentes. Los fallos DEBEN preservar la versión confirmada y respetar la política vigente de conservación de archivos y retirada de páginas sustituidas.
- **FR-020**: La información del capítulo DEBE extenderse de forma compatible, conservando el listado editorial actual y distinguiéndolo de la secuencia de lectura. La transición del consumidor DEBE evitar duplicar la apertura y alterar la posición editorial guardada. Obtener un capítulo no registra lecturas, visitas ni progreso. La planificación DEBE alinear contratos, documentación e integración del consumidor con las nuevas capacidades. Antes de desplegar DEBE existir evidencia de compatibilidad y aceptación explícita del responsable del consumidor, identificando su versión y resultados para lectura, progreso, páginas vacías con continuación y refresco de comentarios desde la primera página; un plan de transición sin validación no satisface esta condición.
- **FR-021**: Solo ADMIN activo DEBE poder consultar de forma paginada las asignaciones de un EDITOR, asignarle explícitamente una obra no eliminada o revocar su asignación. Asignar requiere destinatario EDITOR activo y obra existente; no cambia el rol ni concede acceso a otras obras. Cada asignación y revocación efectiva, incluidas las causadas por una degradación, DEBE conservar obra, editor, actor y fecha en la auditoría administrativa existente y confirmarse junto al cambio. Las repeticiones sin cambio no duplican relaciones ni eventos; reasignar después de revocar requiere una acción explícita y conserva el historial.
- **FR-022**: La restricción para comentar DEBE tener una única fuente de verdad en la autoridad de identidad y permisos de cuentas existente. No se permite duplicar una restricción autoritativa en el almacén de comentarios; la coordinación y recuperación entre proveedores DEBEN preservar los resultados de FR-007 y evitar confirmaciones parciales.

### Key Entities *(include if feature involves data)*

- **Cuenta**: Identidad existente con rol BASIC, EDITOR o ADMIN y estado. Rol y estado son independientes: los cambios permitidos BASIC ↔ EDITOR conservan ACTIVE o SUSPENDED. La restricción de comentarios es independiente de la suspensión de cuenta.
- **Asignación editorial**: Permiso de EDITOR sobre una obra, concedido o revocado explícitamente por ADMIN con auditoría. Se revoca al perder ese rol; recuperarlo requiere otra asignación explícita, sin borrar el historial.
- **Registro administrativo**: Actor, cuenta afectada, roles, fecha y revocaciones editoriales asociadas a un cambio.
- **Sanción de comentarios**: Cuenta, motivo obligatorio, responsable, inicio, fin opcional, revocación y referencia opcional de comentario o reporte. La vigencia se determina conservando el historial; no duplica la autoridad de identidad y permisos. Las referencias no implican copiar texto ni exponer evidencia privada.
- **Obra e imágenes**: Tres referencias independientes para portada, banner de ficha y apertura compartida.
- **Capítulo y páginas**: Secuencia editorial que puede incluir un mensaje como última página; sin entidad de cierre separada.
- **Secuencia de lectura**: Composición de apertura opcional y páginas ordenadas, sin duplicar el contenido persistido.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Con un conjunto estable de cuentas, ADMIN puede recorrer el 100 % de las cuentas no eliminadas con rol y estado; ningún rol no autorizado puede obtener el listado.
- **SC-002**: El 100 % de los intentos de promoción a ADMIN, degradación de ADMIN y eliminación administrativa de ADMIN se rechaza sin cambios, incluida la cuenta del solicitante.
- **SC-003**: Cada cambio confirmado BASIC ↔ EDITOR deja trazabilidad y conserva el estado ACTIVE o SUSPENDED del destinatario y sus sanciones de comentarios vigentes. Tras cada degradación se revocan sus asignaciones y la siguiente operación editorial se rechaza; promover de nuevo no restaura asignaciones previas ni permite actividad a una cuenta que siga suspendida. La verificación incluye ambos cambios para ambos estados y el rechazo de cuentas eliminadas.
- **SC-004**: El 100 % de las creaciones de comentarios y respuestas que sigan pendientes de guardar al confirmarse una sanción vigente, o que se inicien durante su vigencia, se rechaza sin publicar contenido. Los contenidos guardados previamente se conservan y la primera solicitud válida tras el fin o revocación se admite manteniendo los demás permisos. La verificación DEBE incluir envíos concurrentes autorizados antes de la sanción pero pendientes de guardar al confirmarla.
- La aceptación de SC-004 y FR-012 incluye retiradas concurrentes del destino: si despublicación o baja gana antes del guardado aceptado, el contenido no se publica; si gana la creación, su decisión histórica no se reescribe al retirar el catálogo después.
- **SC-005**: Un capítulo con N páginas devuelve exactamente N+1 elementos si tiene apertura y N si falta, conservando el orden del 100 % de sus páginas, incluido el mensaje final cuando exista.
- **SC-006**: El 100 % de las obras publicadas antes del nuevo requisito y sus capítulos comprobados conserva su consulta según permisos sin exigir recargar imágenes ni incorporar cierres automáticos. En las primeras publicaciones posteriores, el 100 % de los intentos con alguna de las tres imágenes ausente se rechaza, sin impedir guardar la obra como borrador.
- **SC-007**: Un responsable autorizado puede guardar y consultar tres imágenes distintas por obra y publicar un mensaje final mediante las operaciones habituales de páginas, sin configurar un cierre en otro apartado.
- **SC-008**: En todos los casos de asignación confirmada, el EDITOR puede gestionar solo las obras asignadas según los permisos existentes; tras revocar, su siguiente operación sobre esa obra se rechaza. Toda asignación, revocación y reasignación efectiva tiene auditoría verificable y no se duplica al repetir una solicitud sin cambio.
- **SC-009**: Toda sanción confirmada tiene motivo no vacío. La ausencia de evidencia vinculada no impide imponerla; el 100 % de las referencias aportadas inexistentes o ajenas a la cuenta se rechaza sin confirmar sanciones parciales ni divulgar evidencia privada.

## Assumptions

- Las respuestas confirman BASIC ↔ EDITOR como únicos cambios administrativos y la protección de ADMIN. Crear administradores queda fuera de los flujos de producto de esta feature.
- Por decisión explícita de la segunda sesión de aclaración, ADMIN activo puede cambiar BASIC ↔ EDITOR tanto en destinatarios activos como suspendidos, conservando su estado. No se añade reactivación de cuentas; las nuevas asignaciones siguen exigiendo EDITOR activo.
- No se añade eliminación de BASIC/EDITOR: la solicitud original pide listado y cambios de rol, y explicita la prohibición de eliminar ADMIN. Una eliminación administrativa futura deberá conservar esa protección.
- Para detalles de sanciones no ampliados se adopta la propuesta presentada: bloqueo de comentarios nuevos y respuestas, vencimiento automático y conservación de otras acciones. Se exige motivo de imposición y se conserva historial privado.
- Por decisión explícita, vincular un comentario o reporte es opcional y no sustituye el motivo obligatorio. No se añaden copias de evidencia ni retención especial del contenido retirado. El historial de sanciones y los datos privados de reportes no son públicos.
- Por decisión explícita, las cuentas ADMIN no pueden recibir sanciones de comentarios. Solo BASIC y EDITOR no eliminados pueden recibirlas; cambiar entre BASIC y EDITOR no revoca ni reinicia una sanción vigente.
- Por decisión explícita, las tres imágenes son obligatorias para la primera publicación de una obra tras entrar en vigor el requisito. No es obligatorio adjuntarlas todas en cada creación de borrador o edición: se utilizan las referencias válidas ya guardadas. Las obras publicadas antes quedan exceptuadas del requisito de completar banners y pueden hacerlo después; su edición y publicación de capítulos siguen disponibles.
- No se fijan dimensiones o relaciones de aspecto nuevas: separar usos permite subir archivos adecuados para cada función conservando validaciones actuales. La apertura sigue siendo una por obra y se comparte entre capítulos.
- El cierre como página ordinaria sustituye la propuesta original de imagen final independiente. El editor decide contenido y posición; el sistema no identifica semánticamente un mensaje final.
- El alcance es el backend existente e incluye gestión de asignaciones editoriales por ADMIN; excluye paneles visuales, nuevos roles, notificaciones, apelaciones y cambios generales de autenticación. Las nuevas operaciones de asignación no cambian los permisos de eliminación de catálogo existentes, cuya discrepancia con las notas históricas ya registra la constitución.
- La aceptación de compatibilidad del consumidor puede ser una dependencia externa: si falta su versión, evidencia o aprobación responsable, el despliegue permanece pendiente. No se presume acceso para modificar otro repositorio ni autorización para enviar mensajes externos.
- No se recibió la presentación anterior; el alcance se basa en los cuatro puntos y las aclaraciones de esta conversación, sin añadir supuestas deudas adicionales.
- La aplicación sigue sujeta a la constitución: PostgreSQL conserva autoridad de identidad y permisos y MongoDB la de comentarios, votos y reportes; no hay transacciones distribuidas. El plan debe concretar migraciones aditivas, contratos tipados, precondiciones de concurrencia y paginación, pipeline multimedia existente, errores seguros y documentación de API/OpenAPI. Las verificaciones de restricciones y carreras requieren proveedores de prueba apropiados; los mocks no demuestran integración real. Estos controles no se consideran entregados por figurar en el spec.
- Contexto: [constitución](../../.specify/memory/constitution.md), [autenticación](../../docs/features/auth.md), [comunidad](../../docs/features/community.md), [catálogo y política multimedia vigente](../../docs/features/works-chapters.md) y [contrato actual](../../docs/API.md). El código local y las decisiones explícitas posteriores prevalecen sobre descripciones históricas del estado del proyecto.
