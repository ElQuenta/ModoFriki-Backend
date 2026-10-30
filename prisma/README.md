# Persistencia PostgreSQL

El esquema conserva `Example` y centraliza usuarios/permisos, catálogo/capítulos, medios, biblioteca y actividad. Comentarios, respuestas, votos y reportes pertenecen a MongoDB. PostgreSQL guarda exclusivamente el permiso durable de creación de comentarios, sin texto ni copia del contenido.

## Configuración existente

- Prisma instalado al preparar esta entrega: `7.10.1`.
- Configuración: `prisma.config.ts`; datasource PostgreSQL y `DATABASE_URL`.
- Generador: `prisma-client`; salida `src/generated/prisma`. No editar esa salida manualmente.
- Cliente de conexión: `src/config/database/postgres.ts`, mediante el adaptador PostgreSQL existente.
- Scripts existentes: `npm run prisma:validate`, `npm run prisma:generate`, `npm run build`. La generación no aplica el esquema a una base.

Todas las PK y FK nuevas son UUID nativas; `uuid()` genera el valor desde Prisma. SQL directo debe suministrar UUID y los campos `updatedAt`, que Prisma mantiene en el cliente. `Example.id` sigue siendo entero autoincremental por compatibilidad, y su fecha conserva el tipo original. Ninguna tabla existente se elimina o transforma.

Los instantes nuevos usan `TIMESTAMPTZ(3)`; la fecha de calendario usa `DATE`. `Chapter.number` es `NUMERIC(12,3)`: la capa de entrada futura debe rechazar más de tres decimales antes de persistir, porque PostgreSQL puede redondear. Intercambiar ese valor como string. `sizeBytes` es `BIGINT`, por lo que una futura respuesta JSON debe convertirlo explícitamente.

## Migraciones versionadas

Las migraciones son aditivas y se revisan como SQL versionado. Están preparadas
para aplicarse únicamente mediante el procedimiento aprobado y se validaron en
una base PostgreSQL desechable; no se aplicaron a una base compartida:

1. `20261019000100_core_domain`: dominio, índices, FK y restricciones base.
2. `20261019000200_chapter_read_receipts`: recibos de lectura idempotentes.
3. `20261020000100_work_visits_count`: contador agregado de visitas.
4. `20261029000100_admin_assignments`: administración de roles y asignaciones.
5. `20261029000200_comment_sanctions_decisions`: sanciones y decisiones durables de creación de comentarios.
6. `20261029000300_work_detail_banner`: banner de ficha y exención histórica de imágenes.
7. `20261030000100_work_cover_thumbnail`: referencia opcional de miniatura de portada; mantiene las referencias independientes.

`migrate deploy` se ejecutó únicamente en destinos desechables identificados en la evidencia de validación. No se ejecutaron migraciones sobre bases compartidas ni `migrate dev`, `migrate resolve`, `db push` o reset. Un push de Git publica archivos, no aplica estas migraciones.

### Antes de cualquier aplicación

Un responsable debe identificar y verificar la base de destino, revisar tablas, secuencias, restricciones e historial `_prisma_migrations`, comparar drift y tomar un backup restaurable. Los archivos locales no prueban el estado real de una base. Probar primero en una base efímera y verificar restauración antes de preparar el despliegue. No ejecutar comandos de esta sección automáticamente desde esta entrega.

- **Base realmente vacía y sin historial:** después de revisión, aplicar todas las migraciones mediante el procedimiento de despliegue aprobado.
- **Base existente sin historial completo:** detener el proceso y diseñar una reconciliación específica. No usar `migrate resolve` para ocultar diferencias ni ejecutar SQL de baseline sin inspección.
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

## Responsabilidades de aplicación y procesos

Las FK usan `RESTRICT` para evitar purgas accidentales de historial, medios y auditoría. El borrado lógico preserva historial y documentos MongoDB; la baja de una obra desvincula sus imágenes conforme a la política de catálogo, sin borrar sus archivos Blob. Services y Repositories implementan permisos, publicación, concurrencia y finalización; el schema por sí solo no ejecuta esas reglas.

No hay FK ni transacción entre PostgreSQL, MongoDB y Blob. Comunidad verifica disponibilidad del destino SQL y decisiones COMMITTED antes de exponer comentarios nuevos. No duplica contenido para suplir una caída MongoDB.

`MediaAsset` guarda metadatos, nunca buffers. El pipeline registra reservas/subidas/confirmación y solo enlaza activos disponibles. La política vigente conserva archivos abandonados, expirados o desvinculados; solo retira generaciones sustituidas de páginas tras commit y comprobación de todas las referencias, incluidos banners y miniaturas. Los scripts de cleanup no autorizan purgas ni un worker periódico. El reconciliador de comentarios es manual y acotado; no promueve huérfanos ni elimina documentos. No interpretar el CHECK de ruta como validación de seguridad de archivos.

## Recuperación y validación

No se entrega un rollback que borre tablas o eventos. Si falla una migración transaccional, comprobar su rollback y el estado registrado por Prisma antes de reintentar; no marcarla como aplicada para ocultar el fallo. Si ya se confirmaron datos, preferir corrección hacia adelante. Una restauración exige respaldo coordinado de SQL/Mongo, exclusión de productores y lectores, y ventana de recuperación acordada. El rollback de aplicación solo admite un artefacto explícitamente compatible con decisiones COMMITTED, marcadores de creación, filtros de todos los accesos y la política de imágenes. No volver a lectores, writers, jobs o scripts anteriores a ese protocolo; conservar esquema aditivo, historial y `Example`. El ensayo desechable está en `specs/001-admin-community-media/validation/deployment-rehearsal.md`.

Validaciones locales pertinentes: format/validate/generate y build. La aceptación de motor requiere aplicar a una base PostgreSQL efímera, probar duplicados concurrentes, FK, puntuaciones inválidas, posiciones/números negativos, contexto anónimo inválido y deduplicación diaria; verificar que anónimos distintos sí cuentan y que renumerar conserva UUID. Si no se dispone de ese entorno, registrar esas pruebas como pendientes y no presentar el SQL generado como migración ejecutada.

## `20261020000100_work_visits_count`

Agrega `Work.visitsCount` (contador agregado para los rankings) y lo rellena desde `WorkVisitEvent`. Es aditiva. El backfill es una foto: si la versión anterior de la app sigue aceptando visitas mientras corre `migrate deploy`, esas visitas no suman al contador. Después de que arranque la versión nueva, volver a correr una vez el mismo `UPDATE` de la migración (es idempotente):

```sql
UPDATE "Work" w SET "visitsCount" = v.total
FROM (SELECT "workId", COUNT(*)::int AS total FROM "WorkVisitEvent" GROUP BY "workId") v
WHERE v."workId" = w."id";
```
