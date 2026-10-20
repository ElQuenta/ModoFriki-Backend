# Persistencia PostgreSQL

El esquema contiene 20 modelos de dominio y conserva `Example` sin cambios. PostgreSQL es la fuente de verdad de usuarios/permisos, catálogo/capítulos, medios, biblioteca y actividad. Comentarios, respuestas, votos y reportes pertenecen exclusivamente a MongoDB y no tienen tablas ni FK aquí.

## Configuración existente

- Prisma instalado al preparar esta entrega: `7.10.1`.
- Configuración: `prisma.config.ts`; datasource PostgreSQL y `DATABASE_URL`.
- Generador: `prisma-client`; salida `src/generated/prisma`. No editar esa salida manualmente.
- Cliente de conexión: `src/config/database/postgres.ts`, mediante el adaptador PostgreSQL existente.
- Scripts existentes: `npm run prisma:validate`, `npm run prisma:generate`, `npm run build`. La generación no aplica el esquema a una base.

Todas las PK y FK nuevas son UUID nativas; `uuid()` genera el valor desde Prisma. SQL directo debe suministrar UUID y los campos `updatedAt`, que Prisma mantiene en el cliente. `Example.id` sigue siendo entero autoincremental por compatibilidad, y su fecha conserva el tipo original. Ninguna tabla existente se elimina o transforma.

Los instantes nuevos usan `TIMESTAMPTZ(3)`; la fecha de calendario usa `DATE`. `Chapter.number` es `NUMERIC(12,3)`: la capa de entrada futura debe rechazar más de tres decimales antes de persistir, porque PostgreSQL puede redondear. Intercambiar ese valor como string. `sizeBytes` es `BIGINT`, por lo que una futura respuesta JSON debe convertirlo explícitamente.

## Migraciones preparadas, no aplicadas

Los archivos se generaron **offline**, con `prisma migrate diff` entre esquemas locales, sin consultar ni modificar las bases configuradas:

1. `20261019000000_existing_example`: baseline que crea solamente la estructura original de `Example` en una base vacía.
2. `20261019000100_core_domain`: incorporación aditiva del dominio, índices, FK, CHECK y unicidad diaria de lecturas registradas. No crea comunidad SQL ni copia documentos MongoDB. Incluye transacción SQL explícita.

No se ejecutaron `migrate dev`, `migrate deploy`, `migrate resolve`, `db push`, reset ni operaciones contra datos existentes. Un push de Git publica los archivos, no aplica estas migraciones.

### Antes de cualquier aplicación

Un responsable debe identificar y verificar la base de destino, revisar tablas, secuencias, restricciones e historial `_prisma_migrations`, comparar drift y tomar un backup restaurable. Los archivos locales no prueban el estado real de una base. Probar primero en una base efímera y verificar restauración antes de preparar el despliegue. No ejecutar comandos de esta sección automáticamente desde esta entrega.

- **Base realmente vacía y sin historial:** después de revisión, aplicar ambas migraciones mediante el procedimiento de despliegue aprobado. No marcar el baseline como aplicado: todavía necesita crear `Example`.
- **Base con `Example` existente y sin historial:** comprobar que su estructura, PK, secuencia, default y tipo de fecha coinciden con el baseline, preservando filas y siguiente valor de la secuencia. Solo después de esa comprobación un responsable puede marcar explícitamente `20261019000000_existing_example` como aplicado mediante `prisma migrate resolve --applied 20261019000000_existing_example`, y luego preparar la migración de dominio. Este comando cambia el historial; **no se ejecutó ni se autoriza automáticamente**. No ejecutar el SQL de creación del baseline sobre esa tabla existente.
- **Base con migraciones previas, tablas adicionales o drift:** detener la aplicación y diseñar una reconciliación específica. No marcar migraciones como aplicadas para ocultar diferencias, no usar reset ni `db push` para forzar coincidencia. Si ya hay datos de dominio, revisar duplicados y compatibilidad antes de crear únicos.

## Restricciones y consultas

El schema Prisma declara PK, FK y únicos de identidad normalizada, slugs, asignaciones, títulos alternativos, géneros, número por obra, posición por capítulo, favoritos, puntuaciones y estado leído. El número de un capítulo sigue reservado tras el borrado lógico: para reponerlo debe restaurarse la misma entidad.

La migración SQL añade restricciones que no aparecen como validadores en el cliente Prisma:

- Numeración no negativa y versión/posición positivas.
- Puntuación de `0..10` medias estrellas, equivalente a `0..5`.
- Tamaño y dimensiones de medios positivos; referencias no vacías.
- Primera lectura anterior o igual a última lectura; revocación posterior o igual a asignación.
- Contexto de lectura: anónimo sin usuario/fecha local/zona; registrado con los tres campos y zona no vacía.
- Índice único parcial `(userId, chapterId, localDate)` para registros con usuario. Reintentos usan además `idempotencyKey` UUID único; visitantes pueden producir otros eventos con claves distintas.
- Un único destino por lote: capítulo **o** obra, nunca ambos ni ninguno; vencimiento posterior a creación. Para un capítulo nuevo se crea primero un borrador o se usa un lote dirigido a la obra; el Service futuro determina su vinculación al confirmar.
- Intentos de limpieza no negativos y rutas previstas/no vacías.

Al generar nuevas migraciones, revisar que se conservan estos CHECK e índice parcial; `db push` o un diff solo de datamodel no sustituye el historial SQL. Las pruebas de cliente sin conexión no demuestran que las restricciones estén desplegadas.

Los índices atienden filtros de catálogo/género, asignaciones, orden de capítulos/páginas, biblioteca, calendario, ventanas de lectura/visita y colas de limpieza. Búsqueda por `contains` no queda acelerada por promesa de un índice B-tree: evaluar búsqueda textual con datos reales. Para reordenar páginas, usar posiciones temporales **positivas y libres** dentro de la transacción y luego posiciones definitivas; la unicidad no es diferible. Rechazar posiciones temporales que desborden INTEGER.

## Servicios y procesos pendientes

Las FK usan `RESTRICT` para evitar purgas accidentales de historial, medios y auditoría. Eliminar lógicamente usuarios, obras o capítulos no borra referencias ni documentos MongoDB. Permisos por rol/asignación, visibilidad pública, timezone IANA válida, publicación y semántica de finalización se implementarán en Services; los esquemas no los ejecutan.

No hay FK ni transacción entre PostgreSQL, MongoDB y Blob. La consulta pública futura debe validar el destino SQL y su estado antes de exponer comunidad. No duplicar comentarios autoritativos para suplir una caída MongoDB.

`MediaAsset` contiene metadatos, nunca buffers. `AVAILABLE/DELETING`, lotes, objetos y jobs preparan la compensación; ningún upload, reconciliador o worker se implementa en esta etapa. La confirmación del lote y la limpieza deben competir sobre su estado; solo se enlazan activos disponibles. El worker futuro debe verificar todas las referencias y coordinar bloqueo/transición antes de borrar Blob. Los jobs/objetos históricos también tienen FK: antes de purgar físicamente un `MediaAsset`, resolver o desvincular sus referencias de seguimiento conforme a una política auditada. No interpretar el CHECK de ruta como validación de seguridad de archivos.

## Recuperación y validación

No se entrega un rollback que borre tablas o eventos. Si falla la migración transaccional, comprobar su rollback y el estado que registró Prisma antes de un reintento; un estado de migración fallida requiere resolución revisada, nunca una marca automática. Si ya se confirmaron datos de dominio, preferir corrección hacia adelante; una restauración requiere el backup y la ventana de recuperación acordados. Una versión anterior de la aplicación puede ignorar tablas nuevas, conservando datos y `Example`.

Validaciones locales pertinentes: format/validate/generate y build. La aceptación de motor requiere aplicar a una base PostgreSQL efímera, probar duplicados concurrentes, FK, puntuaciones inválidas, posiciones/números negativos, contexto anónimo inválido y deduplicación diaria; verificar que anónimos distintos sí cuentan y que renumerar conserva UUID. Si no se dispone de ese entorno, registrar esas pruebas como pendientes y no presentar el SQL generado como migración ejecutada.

## `20261020000100_work_visits_count`

Agrega `Work.visitsCount` (contador agregado para los rankings) y lo rellena desde `WorkVisitEvent`. Es aditiva. El backfill es una foto: si la versión anterior de la app sigue aceptando visitas mientras corre `migrate deploy`, esas visitas no suman al contador. Después de que arranque la versión nueva, volver a correr una vez el mismo `UPDATE` de la migración (es idempotente):

```sql
UPDATE "Work" w SET "visitsCount" = v.total
FROM (SELECT "workId", COUNT(*)::int AS total FROM "WorkVisitEvent" GROUP BY "workId") v
WHERE v."workId" = w."id";
```
