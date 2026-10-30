# Revisión de requisitos — T002

Fecha: 2026-10-30. Solicitada expresamente por el usuario: «Quiero que primero completes los pendientes». Esa instrucción autoriza evaluar y actualizar los marcadores de la checklist antes de continuar; no es aprobación automática desde el ejecutor de tareas.

Revisor independiente: agente `requirements_review`, rol reviewer, solo lectura en checkout `dev`. Coordinador: aplicación de correcciones documentales y marcadores tras contrastar evidencia. Fuentes: [spec](../spec.md), [plan](../plan.md), [modelo](../data-model.md), [HTTP](../contracts/http-api.md), [persistencia](../contracts/persistence.md), [investigación](../research.md), [quickstart](../quickstart.md), [tareas](../tasks.md) y [constitución](../../../.specify/memory/constitution.md).

## Hallazgo y resolución

CHK037, severidad media documental: faltaba declarar si rate limiting, cuotas acumulativas y protección general contra abuso estaban cubiertos. Responsable: coordinador. Corregido en spec §Assumptions y plan §Riesgos y recuperación: fuera del alcance, sin garantías de disponibilidad frente a abuso o crecimiento global acotado. TTL lógico no purga decisiones SQL ni provisionales Mongo; Blob sigue política vigente. El revisor determinó que esta aclaración cierra el criterio al incorporarla; el coordinador verificó su incorporación en ambos documentos.

Riesgo residual para seguimiento separado por coordinador: almacenamiento acumulativo y agotamiento de recursos por abuso, sin rate limiting ni cuotas nuevos. Una futura feature debe especificar controles, responsables, límites y validación; esta aprobación documental no acredita mitigación operativa.

## Matriz de evidencia y responsables

Todas las filas quedan conformes como calidad de requisitos. Los responsables indicados ejecutarán y acreditarán la implementación en sus tareas posteriores.

| CHK | Evidencia / decisión del revisor | Responsable de implementación |
| --- | --- | --- |
| CHK001 | FR-001/002/006/021; HTTP Usuarios; plan API: autenticación y revalidación | Admin / community / DB |
| CHK002 | FR-003/006, Assumptions y HTTP: ADMIN protegido, sin aprovisionamiento de ADMIN | Admin / community |
| CHK003 | FR-002, SC-003 y modelo User: matriz de roles/estados | Admin |
| CHK004 | HTTP: UUID/enums/fechas/límites/cursores/CAS y desconocidos; constitución IX | Admin / community |
| CHK005 | FR-006/009/014/021; HTTP y finalize: propiedad y pertenencia | Admin / community / media |
| CHK006 | FR-014/019; plan pipeline/locks; constitución VI | Media |
| CHK007 | Modelo sanciones y HTTP: trim 1–2000, evidencia opcional y ajena 404; SC-009 | Community |
| CHK008 | FR-008/012; HTTP endsAt y persistencia: reloj SQL tras locks, fin estricto | Community / DB |
| CHK009 | FR-002/010; modelo User/sanción/Comment distinguen estados | Admin / community |
| CHK010 | FR-007/022; persistencia Orden de confirmación: COMMITTED acepta guardado | Community / DB |
| CHK011 | Plan Constraints; constitución VI: JPEG/PNG/WebP, 10/100 MiB y 100/1000 páginas | Media |
| CHK012 | FR-013/018; modelo Work y HTTP Catálogo: funciones, omisión y exención | Media / DB |
| CHK013 | FR-022; constitución V; decisión SQL sin cuerpo Mongo duplicado | DB / community |
| CHK014 | Modelo: unicidad, FK RESTRICT, auditoría y referencias externas sin FK ficticia | DB |
| CHK015 | FR-008; tabla de cierre de sanción e investigación R4: vigencia sin cron | Community / DB |
| CHK016 | FR-005/009/021; HTTP CAS/no-op y modelo: stale precede no-op | Admin / DB |
| CHK017 | FR-015–017/020; HTTP ReadingImage y SC-005: pages/progreso conservados | Media / coordinador |
| CHK018 | FR-007 y SC-004; persistencia creación/sanción: ambos órdenes y respuestas | Community / test |
| CHK019 | Persistencia Fallos; quickstart 4/5/9: timeout, crash, resultado incierto y tardío | Community / test |
| CHK020 | FR-012/022; persistencia fail-closed y HTTP errores | Community |
| CHK021 | Persistencia Visibilidad; quickstart 4: lecturas y todas las acciones | Community / test |
| CHK022 | Modelo Comment; persistencia legacy/marcadores y corte exclusivo | Community / coordinador |
| CHK023 | Persistencia: reconciliación manual máximo 100, inspección por defecto, sin purgas | Community / DB |
| CHK024 | HTTP Idempotency-Key; modelo decisión: UUID global, autor/huella y ausencia de clave | Community |
| CHK025 | FR-009/021; HTTP UUID de sanción y CAS de asignación impiden revocación antigua | Admin / community |
| CHK026 | Plan/persistencia locks User→Work; quickstart carreras y pérdida de permiso | DB / media / test |
| CHK027 | Persistencia padre antes/después de staging; modelo evidencia histórica sin copia | Community |
| CHK028 | HTTP: cursores inmutables, límite, candidato examinado, página vacía y refresco | Admin / community / consumidor |
| CHK029 | Modelo DTO; HTTP AdminUser/SanctionDto/vista propia excluyen secretos y reporteros | Admin / community |
| CHK030 | HTTP Errores; persistencia logs mínimos; constitución IX sin cuerpos/huellas/secretos | Todos los implementadores |
| CHK031 | Spec Assumptions y modelo evidencia: conservar referencia, sin nueva retención/purga | Community / DB |
| CHK032 | FR-010/011; HTTP 403 por sanción conserva sesión y consulta propia limitada | Community / consumidor |
| CHK033 | Plan Riesgos y constitución VI: Blob público sin confidencialidad de borradores | Media / coordinador |
| CHK034 | Plan Migración, modelo y quickstart: destino/historial/drift/backup y baseline | DB / coordinador |
| CHK035 | Persistencia Corte y plan: sin versiones antiguas concurrentes; rollback compatible | Coordinador / DB |
| CHK036 | Constitución VIII: sanitizar Markdown; HTTP consumidor y P5/T053/T060 alinean contratos | Coordinador / consumidor |
| CHK037 | Corrección en spec Assumptions y plan Riesgos: exclusión y riesgo residual explícitos | Coordinador, seguimiento separado |
| CHK038 | SC-001–004/008/009; plan negativos/atomicidad/concurrencia y quickstart | Test / reviewer |
| CHK039 | Constitución IX; quickstart evidencia; T061/T062 distinguen mocks/proveedores reales | Test / DB |
| CHK040 | Plan trazabilidad/owners; tasks historias/cierre; constitución Governance | Coordinador / reviewer |

## Resultado y límites

[security.md](../checklists/security.md): 40/40 criterios conformes tras corrección. [requirements.md](../checklists/requirements.md): 16/16, revisada su cobertura de historias, FR y SC; sin alterar marcadores. Ningún requisito pendiente de aclaración de producto detectado. T064 sigue pendiente: revisará código y evidencia real cuando existan.

No se ejecutaron build, tests, migraciones, conexiones ni subidas. Esta matriz acredita requisitos documentados, no seguridad de implementación, servicios disponibles, aceptación del consumidor o despliegue. No cambios de constitución, dependencias ni código de aplicación. Sin commit ni integración a QA.
