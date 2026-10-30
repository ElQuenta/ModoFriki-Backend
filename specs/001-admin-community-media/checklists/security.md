# Validaciones y seguridad de datos: administración, sanciones e imágenes

**Purpose**: Revisar integridad, claridad, consistencia y cobertura de los requisitos de validación, autorización, privacidad, integridad y recuperación de datos antes de implementar la feature.
**Created**: 2026-10-29
**Feature**: [spec.md](../spec.md)
**Plan**: [plan.md](../plan.md)
**Depth**: Estándar, priorizada por riesgo; revisión de requisitos previa a implementación y revisión de PR.
**Audience**: Revisor de requisitos y seguridad, con apoyo del responsable de persistencia.

**Note**: Checklist personalizada generada con `$speckit-checklist`; todos los ítems nuevos quedan pendientes de revisión.
**Review Ownership**: El revisor es responsable de los marcadores. Marcar `[x]` únicamente cuando determine que el criterio de calidad de requisitos está satisfecho.
**Marker Semantics**: `[x]` significa aprobación de la calidad del requisito; no certifica implementación, prueba ejecutada, migración aplicada ni seguridad del despliegue.

Fuentes: [constitución](../../../.specify/memory/constitution.md), [modelo de datos](../data-model.md), [contrato HTTP](../contracts/http-api.md), [contrato de persistencia](../contracts/persistence.md), [investigación](../research.md) y [guía de validación futura](../quickstart.md). La trazabilidad de implementación y verificación está definida en [tasks.md](../tasks.md). La revisión de esta checklist corresponde a T002 y se retoma en T064.

## Completitud de validación y autorización

- [x] CHK001 ¿Están definidos los requisitos de autenticación y rol vigente para cada operación administrativa y consulta propia, incluida la revalidación antes de confirmar cambios? [Completitud, Spec §FR-001–003/006/021; Constitución §IV]
- [x] CHK002 ¿Está delimitada la protección de ADMIN contra promoción, degradación, eliminación y sanción, incluida la cuenta del actor y la exclusión del aprovisionamiento operativo? [Completitud, Spec §FR-003/006/010; HTTP §Usuarios y asignaciones]
- [x] CHK003 ¿Está completa la matriz de cambios BASIC ↔ EDITOR para destinatarios ACTIVE y SUSPENDED, con conservación de estado y sanciones, exclusión de eliminados y actor ADMIN activo? [Cobertura, Spec §FR-002/004; SC-003]
- [x] CHK004 ¿Están documentadas las reglas para validar identificadores, enums, fechas, límites, cursores y campos desconocidos, sin permitir introducir campos privilegiados o internos desde el cliente? [Completitud, HTTP §Usuarios y asignaciones / Sanciones y vista propia; Constitución §IX]
- [x] CHK005 ¿Están definidos los requisitos de propiedad y relación entre usuario, obra, asignación, sanción y evidencia, evitando que un identificador válido autorice operar sobre datos ajenos? [Completitud, Spec §FR-006/009/014/021; SC-009]
- [x] CHK006 ¿Está especificado el orden de autorización del recurso antes de recibir o subir imágenes y la revalidación si cambian permisos durante la operación? [Completitud, Spec §FR-014/019; Plan §API y pipeline; Constitución §VI]

## Claridad de entradas, límites y estados

- [x] CHK007 ¿Son inequívocos el motivo obligatorio y su longitud, el vínculo opcional de evidencia y el resultado de aportar evidencia inexistente o de otra cuenta? [Claridad, Spec §FR-006/012; Modelo §CommentSanction nueva; HTTP §Sanciones y vista propia]
- [x] CHK008 ¿Está definido el significado de sanción permanente, el instante exacto de vencimiento y la autoridad temporal, incluidas fechas con zona horaria, fin igual al inicio y espera por concurrencia? [Claridad, Spec §FR-008/012; Persistencia §Flujo de creación / Flujo de sanción]
- [x] CHK009 ¿Están claramente diferenciados rol, suspensión general de cuenta, sanción de comentarios y estado de publicación de un comentario, sin usar sus términos como equivalentes? [Claridad, Spec §FR-002/010; Modelo §User existente / CommentSanction nueva / Comment existente]
- [x] CHK010 ¿Está especificado qué constituye un guardado aceptado frente a una preparación provisional y en qué punto entra en vigor el bloqueo de una sanción? [Claridad, Spec §FR-007/022; SC-004; Persistencia §Orden de confirmación]
- [x] CHK011 ¿Están cuantificados formatos, tamaño individual y total, cantidades de archivos y páginas, y la comprobación del contenido real de las imágenes? [Claridad, Spec §FR-019; Plan §Technical Context; Constitución §VI]
- [x] CHK012 ¿Son explícitas las tres funciones de imagen, la diferencia entre omitir y sustituir un archivo, y la condición histórica que permite publicar con banners pendientes? [Claridad, Spec §FR-013/018; Modelo §Work existente; HTTP §Catálogo y multimedia]

## Consistencia de integridad y autoridad de datos

- [x] CHK013 ¿Son consistentes spec, modelo y contratos al asignar una única autoridad a identidad, permisos, comentarios y archivos, sin duplicar cuerpos ni restricciones autoritativas entre proveedores? [Consistencia, Spec §FR-022; Constitución §V; Modelo §CommentCreationDecision nueva]
- [x] CHK014 ¿Están alineados los requisitos de unicidad, referencias y conservación del historial para sanciones, asignaciones, auditoría y páginas, incluidas referencias entre proveedores sin una relación transaccional ficticia? [Consistencia, Spec §FR-004/008/009/021; Modelo §PostgreSQL; Constitución §V]
- [x] CHK015 ¿Se distinguen de forma consistente la vigencia temporal de una sanción y el cierre de su registro, sin depender de una tarea periódica para recuperar el permiso de comentar? [Consistencia, Spec §FR-008; Modelo §CommentSanction nueva; Investigación §R4]
- [x] CHK016 ¿Son coherentes las reglas de concurrencia para cambios de rol, asignaciones y sanciones, incluida la precedencia entre versión obsoleta y solicitud sin cambio? [Consistencia, Spec §FR-005/009/021; Modelo §User existente / WorkEditorAssignment existente; HTTP §Usuarios y asignaciones]
- [x] CHK017 ¿Se mantiene alineado el contrato de lectura con las páginas editoriales, los recuentos y el progreso, sin duplicar la apertura ni convertir el mensaje final en una entidad especial? [Consistencia, Spec §FR-015–017/020; SC-005; HTTP §Catálogo y multimedia]

## Cobertura de escenarios adversos y recuperación

- [x] CHK018 ¿Están definidos los requisitos cuando una sanción gana frente a una creación pendiente y cuando el comentario ya fue aceptado antes de la sanción, tanto para raíces como respuestas? [Cobertura, Spec §FR-007; SC-004; Persistencia §Flujo de creación / Flujo de sanción]
- [x] CHK019 ¿Está documentado qué ocurre ante timeout, escritura remota tardía, muerte del proceso y confirmación de resultado incierto, sin interpretar ausencia de respuesta como ausencia de escritura? [Cobertura, Spec §Edge Cases; Persistencia §Fallos y recuperación]
- [x] CHK020 ¿Están definidos los requisitos de rechazo seguro cuando no se pueden verificar identidad, sanción, evidencia o permiso de publicación, sin recurrir a una autoridad alternativa? [Cobertura, Spec §FR-012/022; Persistencia §Visibilidad y todos los caminos]
- [x] CHK021 ¿Está completa la cobertura de visibilidad de contenido provisional para listados, detalle, hilos, padres, edición, eliminación, votos, reportes y evidencia, además de la creación? [Cobertura, Spec §FR-007/022; Persistencia §Visibilidad y todos los caminos]
- [x] CHK022 ¿Están diferenciados los requisitos de comentarios heredados y nuevos, incluido el rechazo de marcadores ausentes indebidamente, nulos, malformados o inconsistentes después del corte? [Cobertura, Persistencia §Visibilidad y todos los caminos / Corte y validación obligatoria; Plan §Migración y puesta en servicio]
- [x] CHK023 ¿Están definidos los límites, responsables y efectos permitidos de reconciliación y recuperación, sin restaurar operaciones rechazadas ni autorizar purgas o limpieza de archivos fuera del alcance? [Cobertura, Spec §FR-019/022; Persistencia §Fallos y recuperación; Constitución §V/VI]

## Casos límite de concurrencia, reintento y paginación

- [x] CHK024 ¿Están documentados el alcance de las claves de reintento, su vinculación a autor y solicitud, las colisiones y el comportamiento si el cliente no aporta una clave? [Casos límite, HTTP §Creación y lectura de comentarios existentes; Modelo §CommentCreationDecision nueva]
- [x] CHK025 ¿Está especificado que una revocación antigua no afecte una nueva sanción o reasignación y que repetir una operación sin cambio no duplique relaciones o eventos? [Casos límite, Spec §FR-009/021; Modelo §WorkEditorAssignment existente; Persistencia §Contratos por repositorio]
- [x] CHK026 ¿Están cubiertos en los requisitos dos cambios simultáneos, degradación durante subida, imposiciones concurrentes y pérdida de permiso antes de confirmar, con resultados de conflicto inequívocos? [Casos límite, Spec §FR-005/008/019/021; Plan §Persistencia y contratos compartidos]
- [x] CHK027 ¿Están definidos los resultados cuando se retira el padre de una respuesta o se elimina contenido vinculado como evidencia durante una preparación, preservando el hilo y el historial? [Casos límite, Spec §Edge Cases; Persistencia §Flujo de creación; Modelo §CommentSanction nueva]
- [x] CHK028 ¿Están documentados límites, orden estable, cursores en registros mutables y páginas vacías con continuación, así como la información mínima que revela el cursor? [Casos límite, Spec §FR-001/011; HTTP §Usuarios y asignaciones / Creación y lectura de comentarios existentes]

## Privacidad y requisitos de protección de datos

- [x] CHK029 ¿Están definidas proyecciones separadas para datos públicos, administración y consulta propia, excluyendo credenciales, normalizados, reporteros y datos personales de moderadores donde no sean necesarios? [Privacidad, Spec §FR-001/011; HTTP §Sanciones y vista propia; Constitución §IV/VIII/IX]
- [x] CHK030 ¿Están especificados los datos permitidos en logs y errores, así como la exclusión de secretos, tokens, conexiones completas, cuerpos de comentarios, motivos y huellas sensibles? [Privacidad, HTTP §Errores y documentación de entrega; Persistencia §Fallos y recuperación; Constitución §IX]
- [x] CHK031 ¿Está delimitada la conservación de historial y referencias de evidencia, sin prometer copias del texto retirado ni una política nueva de retención o purga no aprobada? [Privacidad, Spec §Assumptions; Modelo §CommentSanction nueva; Constitución §V]
- [x] CHK032 ¿Está definida la separación entre bloqueo por permiso y fallo de autenticación para que una sanción no invalide la sesión ni divulgue evidencia privada? [Privacidad, Spec §FR-010/011; HTTP §Creación y lectura de comentarios existentes]
- [x] CHK033 ¿Son consistentes los requisitos de exposición de imágenes con el almacenamiento público actual, sin prometer confidencialidad de borradores que el diseño no proporciona? [Privacidad, Plan §Riesgos y recuperación; Constitución §VI]

## Dependencias, migraciones y supuestos de seguridad

- [x] CHK034 ¿Están documentadas las precondiciones de migración y conservación de datos —destino, historial, discrepancia de baseline, restricciones, respaldo restaurable y recuperación— sin reconciliación destructiva implícita? [Dependencias, Plan §Migración y puesta en servicio; Modelo §Migración y transición; Constitución §Contexto y restricciones del producto]
- [x] CHK035 ¿Están definidos el corte de escritores antiguos y las versiones compatibles de recuperación para impedir que una versión previa publique contenido provisional o eluda las reglas nuevas? [Dependencias, Plan §Migración y puesta en servicio; Persistencia §Corte y validación obligatoria]
- [x] CHK036 ¿Están delimitadas las dependencias de seguridad del consumidor —sanitización de Markdown, secuencia de lectura, cursores y presentación de restricciones— y el responsable de mantener sus contratos alineados? [Dependencias, Constitución §VIII/IX; HTTP §Errores y documentación de entrega; Plan §Trabajo secuenciado, responsables y dependencias]
- [x] CHK037 ¿Queda explícito si la protección general contra abuso, las cuotas de acumulación de registros provisionales y la limitación de solicitudes se cubren en esta feature o permanecen como riesgos fuera de su alcance, sin presentar garantías inexistentes? [Gap, Assumption; Plan §Riesgos y recuperación; Investigación §Resultado]

## Calidad de criterios de aceptación y trazabilidad

- [x] CHK038 ¿Los criterios de éxito de seguridad e integridad son medibles y cubren permisos negativos, atomicidad de auditoría, aislamiento de datos y concurrencia, sin limitarse al camino satisfactorio? [Criterios de aceptación, Spec §SC-001–004/008/009; Plan §Plan de pruebas y criterios de aceptación]
- [x] CHK039 ¿Está documentada la evidencia exigida para aceptar garantías entre proveedores y de migración, distinguiendo revisión documental, pruebas con dependencias simuladas y validaciones sobre proveedores desechables? [Medibilidad, Constitución §IX; Plan §Constitution Check; Quickstart §Criterio de salida y evidencia]
- [x] CHK040 ¿Están trazados los requisitos de datos y seguridad a contratos, responsables y criterios de aceptación, con un tratamiento explícito para discrepancias históricas o excepciones antes de integrar a QA? [Trazabilidad, Plan §Trabajo secuenciado, responsables y dependencias; Spec §Assumptions; Constitución §Governance]

## Notes

- Revisión asistida solicitada expresamente el 2026-10-30: 40/40 criterios conformes, tras corregir CHK037. Evidencia y responsables en [requirements-review.md](../validation/requirements-review.md); no certifica implementación ni pruebas.
- Registrar hallazgos junto al identificador CHK correspondiente, citando el requisito afectado y su decisión o corrección.
- Un marcador `[Gap]` solicita aclarar la cobertura o exclusión de un riesgo; no incorpora automáticamente requisitos nuevos al alcance.
- La checklist cubre escenarios principales, alternativos, adversos, recuperación y cualidades de seguridad. No sustituye las decisiones de producto ya aceptadas ni exige nuevas librerías.
- `$speckit-implement` consulta el estado como condición de inicio y no debe modificar estos marcadores. Una evaluación asistida requiere petición explícita del revisor.
- [requirements.md](requirements.md) mantiene su ciclo independiente de calidad general del spec; no se modifica con esta entrega.
- Las validaciones ejecutables futuras están descritas en [quickstart.md](../quickstart.md); esta lista revisa cómo están definidos los requisitos.
