# Contratos de persistencia y coordinación

Diseño normativo para implementación de [FR-007/022](../spec.md); no código completo ni prueba de integración. Reutilizar Prisma/Mongoose. Repositories encapsulan sesiones, SQL y Mongo; Services coordinan contratos tipados sin Request/Response ni clientes directos.

## Orden de confirmación

El guardado aceptado del comentario se confirma al pasar su decisión SQL a COMMITTED, **después** de guardar contenido Mongo provisional con confirmación durable. Provisional no es publicación ni un comentario utilizable. Una sanción confirmada antes de esa decisión rechaza la creación pendiente. Si la decisión se confirmó antes de sanción, es contenido previamente guardado, aunque se haya perdido la respuesta HTTP. No se promete que una preparación física interna sea una transacción distribuida.

## Contratos por repositorio

| Operación | Garantía |
| --- | --- |
| AdminRepository.changeRole(actor,target,role,expectedUpdatedAt) | Locks/revalidación; estado/sanciones intactos; revocaciones y auditoría atómicas; devuelve nueva proyección. |
| AdminRepository.assign/revoke(actor,editor,work,expectedVersion) | Locks User→Work, CAS versión y auditoría; no-op solo precondición actual; no reactivar cuenta. |
| SanctionRepository.impose(actor,target,input,evidenceValidated) | Lock actor/destinatario; hora SQL actual; proteger ADMIN; cerrar vencida; insertar sanción+evento y rechazar todas PREPARED del destinatario en misma transacción. |
| SanctionRepository.revoke(actor,target,sanctionId) | Opera por UUID específico; conserva historial; idempotente sin duplicar evento; nunca selecciona otra vigente. |
| CommentCreationRepository.prepare(author,operationId,fingerprint) | Lock User, estado/rol/sanción actual; crear PREPARED 60s o devolver estado existente si mismo autor/huella; sin contenido SQL. |
| CommentRepository.stageRoot/stageReply(operationId,input) | UUID estable, marcador inmutable, contenido Mongo durable; no sobrescribir staging en reintento. Respuesta hereda destino/raíz y respeta transacción de padre. |
| CommentCreationRepository.finalize(author,operationId,stagedTarget) | Locks User→Work del destino, revalidar cuenta/sanción/expiry y publicación/no eliminación de obra y capítulo cuando corresponda; CAS PREPARED→COMMITTED o REJECTED. stagedTarget procede del documento Mongo preparado durablemente, no de referencias arbitrarias del cliente. |
| CommentCreationRepository.findDecisions(ids) | Una consulta SQL parametrizada y proyección mínima; COMMITTED inmutable; ids no encontrados no son visibles. |
| CommentCreationRepository.rejectExpired/resolve(id) | Acotado y con User lock; nunca promover PREPARED/REJECTED tras fallar/sancionar. Resolver COMMITTED por id sin nueva autorización de creación. |

Preparación rechazada no necesita guardar cuerpo. El id optional del header y fingerprint canónico de autor/parent o target/body se validan antes del protocolo; rechazar reutilización con otra solicitud. Los límites y hashes se calculan con utilidades instaladas, sin almacenar body en SQL.

## Flujo de creación

1. Autenticar, validar entrada y destino publicado, derivar identidad y validar padre accesible si respuesta. Generar/validar operationId. prepare devuelve PREPARED tras confirmar SQL; una decisión terminal se reproduce sin crear otra.
2. stageRoot/stageReply escribe Mongo con _id=operationId y creationOperationId=operationId. Write concern majority en la operación o al commit de sesión; no prometer resultado durable a partir de timeout. Si existe documento del mismo id, comprobar autor, marcador y huella canónica del contenido mediante lectura de recuperación desde primary con readConcern majority antes de finalize; un duplicate key o una lectura local no demuestra durabilidad. No sobrescribir ni repetir efectos secundarios sobre el padre en un reintento ya preparado durablemente.
3. Si staging se confirmó, el Service obtiene del documento preparado su targetType/targetId y la obra correspondiente y los entrega como stagedTarget. finalize toma locks User→Work y, para decisiones aún PREPARED, revalida cuenta, sanción, vencimiento y destino: WORK exige obra PUBLISHED y deletedAt=null; CHAPTER exige capítulo PUBLISHED, deletedAt=null y perteneciente a esa obra, además de obra PUBLISHED y deletedAt=null. Usa el mismo lock Work que las mutaciones de catálogo para serializar despublicación/baja frente a aceptación. La hora se consulta después de adquirir los locks (clock_timestamp SQL), no desde la petición ni antes de una espera. PREPARED vencida, cuenta no activa o sanción vigente → REJECTED con su código; destino no disponible → REJECTED/TARGET_UNAVAILABLE. Caso válido → COMMITTED. Ninguna llamada Mongo sucede dentro de esta transacción.
4. Solo devolver 201/DTO accesible si COMMITTED y documento durable presente. La decisión no depende de una respuesta HTTP exitosa. Si vence o se sanciona antes del commit SQL, devolver rechazo y no publicar; nunca recuperar ese id como nuevo permiso.

Un rechazo se devuelve como resultado tipado del repositorio después de confirmar REJECTED; el Service traduce TARGET_UNAVAILABLE a 404 fuera de la transacción. Lanzar AppError dentro y revertir esa decisión no satisface la recuperación prevista. COMMITTED/REJECTED previos no se reescriben: el replay conserva la decisión original y la disponibilidad actual solo condiciona qué contenido puede devolver al consumidor. Las combinaciones de estado/fechas/código son las tablas explícitas de [data-model.md](../data-model.md).

Para respuestas, el padre debe estar accesible y activo en la transacción Mongo de staging; una eliminación posterior a ese staging conserva el nodo como tombstone y no invalida la respuesta ya preparada. Una eliminación anterior impide prepararla. No se promete una comprobación atómica distribuida del estado del padre en el commit SQL final. Esto preserva el orden transaccional de creación/borrado Mongo y los hilos existentes, independientemente del permiso de sanción que se decide después en SQL.

No esperar red Mongo dentro de transacción SQL ni activar visibilidad basándose en que una consulta Mongo no encontró el documento: la escritura podría seguir en curso. Con resultado SQL incierto, leer el id y reproducir estado; si no se puede leer, 503 y ningún permiso supuesto.

## Flujo de sanción

Validar motivo/fecha y evidencia opcional por repositorios de comentarios/reportes accesibles. Fuera de la transacción SQL, resolver evidencia sin copiar su texto. Bajo locks User de actor/destinatario en UUID asc, revalidar ADMIN activo, destinatario BASIC/EDITOR no eliminado y fin futuro. Cerrar vencida si corresponde, insertar sanción y auditoría, cambiar PREPARED del autor a REJECTED/SANCTIONED, y confirmar juntos. No esperar operaciones remotas pendientes.

Si staging llega después de esa confirmación, su decisión ya es REJECTED: ningún lector/acción lo acepta. Si COMMITTED ganó el mismo lock antes, la sanción no lo elimina: fue guardado aceptado antes. Revocar o vencer no modifica decisiones rechazadas. Falta de restricción verificable falla cerrada.

## Visibilidad y todos los caminos

- Legacy con campo de operación estrictamente ausente: accesible según reglas actuales; solo existe porque el corte drenó writers antiguos. Todo writer nuevo siempre marca. null, UUID malformado o marcador distinto de _id no son legacy y se ocultan/rechazan como inconsistencias; no API para borrar/mutar ese marcador.
- Nuevo con marcador: accesible únicamente con decisión COMMITTED del mismo id/autor. Mantener status ACTIVE/DELETED para contenido visible; decisión ausente/PREPARED/REJECTED no admite respuesta, voto, reporte, edición, eliminación, evidencia ni expansión de hilo.
- Si falla SQL al comprobar decisiones de documentos marcados, la operación falla con 503: nunca degradar a tratamiento legacy ni asumir permiso por existencia Mongo.
- Encapsular findAccessibleById y filterAccessibleBatch como contratos entre repositorios/Service. El helper Mongo touchActiveComment recibe solo referencias previamente admitidas y conserva su control transaccional de status/revision. No reemplazar ese control por la decisión SQL, ni filtrar recién después de mutar.
- Listas: tomar limit+1 candidatos Mongo con orden/cursor existentes, resolver decisiones de los primeros limit en una consulta SQL, conservar legacy y COMMITTED, cursor del último examinado; hasMore se basa en candidato adicional. Puede devolverse página vacía. No pasar cursor del extra no examinado ni saltarse un candidato visible; no N+1 ni escaneo ilimitado.
- El recorrido no representa una instantánea ni garantiza incorporar confirmaciones posteriores detrás del cursor. Si un provisional ya examinado pasa a COMMITTED, aparecerá al refrescar desde la primera página, sin cursor. El consumidor reinicia explícitamente el recorrido al actualizar comentarios y sustituye su colección local; continuar el cursor anterior no equivale a refrescar. No se añade orden por fecha de confirmación, polling obligatorio ni índice nuevo por esta decisión.
- No devolver detalle de pendientes a usuarios ni exponer contenido/huellas en logs. Datos de autores siguen hidratándose con la proyección pública actual.

## Fallos y recuperación

| Fallo | Estado observable / recuperación |
| --- | --- |
| SQL prepare falla | Sin staging; error seguro. |
| Mongo falla antes/durante staging o resultado desconocido | PREPARED o posteriormente REJECTED; contenido oculto aunque write termine tarde. No finalizar sin confirmación durable. |
| Proceso muere entre staging y finalize | PREPARED invisible; vence y se rechaza de forma acotada. Retry con misma clave antes de vencer puede confirmar staging y revalidar; si sanción ganó, rechazo permanente. |
| Sanción gana mientras hay staging | REJECTED terminal; contenido nunca aparece por lectura. |
| Despublicación o baja del destino gana antes de finalize | REJECTED/TARGET_UNAVAILABLE se confirma y la petición recibe 404; provisional permanece oculto. Si COMMITTED gana primero, la moderación posterior del catálogo aplica sus reglas normales sin cambiar la decisión histórica. |
| SQL finalize tiene resultado incierto | Consultar id; COMMITTED se reproduce, REJECTED se rechaza, PREPARED requiere revalidación. Sin SQL, 503. |
| Respuesta HTTP se pierde después de COMMITTED | Retry con misma clave devuelve mismo comentario si disponible; no duplicar. Sin clave aportada no prometer deduplicación de reintento manual. |
| Mongo no disponible al leer COMMITTED | Error seguro de dependencia, no inventar cuerpo SQL. |
| Expira/revocan sanción | Nuevas operaciones pueden proceder; REJECTED anteriores no se resucitan. |

Reconciliación manual acotada con src/scripts/reconcile-comment-creations.ts: por autor/ids y máximo 100 registros; modo inspección por defecto, --apply explícito para rechazar PREPARED vencidas bajo locks. No confirmar automáticamente solicitudes huérfanas ni purgar documentos. COMMITTED mantiene permiso y su cuerpo solo se recupera de Mongo. Sin worker periódico ni cambios de limpieza Blob. Métricas/logs de conteos, operationId y códigos internos sin motivos/cuerpos/hash/tokens.

## Locks y límites

Todos los repositorios implicados: User UUID asc → Work UUID asc → filas auxiliares. Mutaciones de catálogo adquieren lock del actor antes de Work y revalidan asignación bajo esa protección; revocación toma mismo usuario y obra. Degradación bloquea destinatario y revoca asignaciones/auditoría juntas. Implementar SQL parametrizado en helpers de persistencia con timeouts acotados y traducción a 409 para conflicto conocido/503 si no se puede completar, sin reintentos ciegos de efectos Mongo.

Helper único src/repositories/user-locks.ts (propietario DB, entregado en P1) recibe cliente transaccional y lista de UUID, deduplica/ordena y adquiere locks parametrizados. Administración, sanciones y catálogo lo consumen; no mantener copias con distinto orden ni tomar locks desde un middleware/Service.

Nuevas transacciones administrativas/sanciones/decisiones Prisma: maxWait 2s y timeout 5s iniciales, sin red externa dentro; confirmar soporte en tipos locales y medir operaciones de revocación masiva antes de aceptar esa cota. Preservar timeout 30s actual de ChapterRepository.save y límites de transacciones de catálogo existentes: no reducirlos por arrastre al añadir locks; optimizar o modificar solo con medición y regresión de hasta 1000 páginas. No ejecutar Promise.all dentro de una sesión Mongo transaccional. Mantener los límites existentes de cuerpo, árbol y revision. Prepare dura 60s por decisión y no se amplía por retry; usar hora SQL como autoridad.

## Corte y validación obligatoria

No reader/writer antiguo concurrente tras activar marcador. Nuevo reader debe desplegarse para todos los endpoints y scripts antes de aceptar provisional alguno. Rollback solo a versión con filtro de decisiones. La prueba real debe pausar staging, sancionar y terminar write tarde; demostrar ocultación por cada endpoint, no solo la respuesta de creación. También cubrir COMMITTED previo a sanción, expiración/revocación, crash, timeout y commit incierto con IDs deterministas.

Incluir despublicación y baja concurrentes de WORK, CHAPTER y obra padre, en ambos órdenes respecto a finalize, verificando 404 y persistencia de TARGET_UNAVAILABLE cuando gana la retirada. Cubrir también un provisional examinado detrás del cursor que se confirma después: no aparece al continuar ese recorrido y sí al refrescarlo desde el inicio. La compatibilidad del consumidor con esta política requiere evidencia y aceptación antes del despliegue, según [HTTP](http-api.md).
