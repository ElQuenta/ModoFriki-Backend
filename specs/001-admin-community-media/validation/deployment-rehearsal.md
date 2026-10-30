# Ensayo de despliegue y recuperación — T062

Fecha: 2026-10-30. **PASS en entorno desechable**. Rama
`feature/admin-community-media-phase-7`, HEAD base
`1b134ffdacfe7ec8374be05f30583a4743e6b7c6` más cambios actuales sin commit.
Evidencia ejecutable: [deployment-rehearsal-results.json](deployment-rehearsal-results.json).

## Entorno y reproducción

Instancias propias nuevas en loopback: PostgreSQL 17.11:62350 y MongoDB
8.0.34:62351, replica set `mf_phase7`. Node 24.22.0. Binarios temporales
reutilizados de fases anteriores; sin Docker, instalación de servicios ni bases
compartidas. Destinos con UUID y prefijo mf_admin_test registrados en el JSON.

El ejecutable `test-support/deployment-rehearsal.mjs` recibe un JSON temporal
`{ runRoot, pgBin, pgPort, mongoPort }` de instancias nuevas exclusivas y la ruta
absoluta de un entrypoint compatible. Desde la raíz, después del build:

```text
node test-support/deployment-rehearsal.mjs <runtime.json> <rollback/dist/index.js>
```

El rollback se compiló desde `git archive HEAD` en una carpeta temporal, con las
dependencias existentes y copia del cliente generado. El candidato es el build
actual. Sus hashes de directorio SHA-256 están en el JSON. No se cambió el checkout
para construir el rollback ni se descargaron dependencias.

## Comprobaciones ejecutadas

1. Prisma aplica cinco migraciones anteriores al banner. La frontera se fija por
   `20261029000300_work_detail_banner`; la migración posterior de miniaturas no se
   confunde con el corte. Se crean obras publicada, antes publicada/DRAFT y nunca
   publicada, decisiones COMMITTED/PREPARED/REJECTED y cuatro documentos Mongo.
2. `Example` no lo crea la cadena local. Se representa explícitamente como tabla
   heredada y una fila de fixture, sin inventar ni marcar una migración baseline.
3. Un proceso real compatible arranca, responde /health, se cierra y el supervisor
   espera su salida antes de respaldar. No existen productores externos en estas
   instancias; el supervisor impide generaciones de aplicación simultáneas.
4. Respaldo PostgreSQL con `pg_dump -Fc`; comentarios e índices con BSON EJSON
   canónico. Una copia temporal del SQL de banner recibe `SELECT 1/0` antes de
   COMMIT: Prisma falla y registra historia incompleta; las columnas se revierten.
5. `pg_restore --exit-on-error` recupera otra base vacía. Mongo restaura documentos
   e índices; se comparan exactamente con el origen. Se conserva el destino fallido
   para diagnóstico, sin resolve, reset, purga ni ocultación del historial.
6. Se aplican las siete migraciones originales sobre el destino restaurado. Se
   verifican nombres/checksums del historial, fila Example y las tres decisiones.
   Exención: publicada y antes publicada=true; nunca publicada=false.
7. `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
   --exit-code` devuelve 0 sobre el destino restaurado con Example heredado.
8. El candidato arranca y GET comentarios devuelve solo legacy/COMMITTED. Se
   detiene y se inicia el artefacto HEAD anterior compatible: mismo resultado.
   Las tres decisiones y los cuatro documentos permanecen después del rollback
   de aplicación. No se baja el esquema ni se elimina contenido.

Los intentos iniciales detectaron errores de fixtures (frontera, cast UUID, reloj
de decisión, opciones de índice) y la ausencia de Example en la comparación.
Se corrigieron antes del PASS; ningún intento fallido se presenta como exitoso.

## Alcance del ensayo y corte compartido

Este ensayo acredita recuperación de fixtures y rollback de seguridad de
publicación. El artefacto HEAD anterior conserva defectos corregidos en el
candidato; su smoke no lo convierte en versión recomendada para producción.
Seleccionar y validar un rollback soportado antes de una ventana real.

No acredita backup completo de Mongo (votos/reportes), bytes Blob, hosting,
tráfico real en curso ni exclusión de jobs externos. Antes de desplegar, el
responsable debe inventariar y detener TODOS los lectores/writers/jobs antiguos,
drenar tráfico y conexiones, verificar historial/drift reales, respaldar y probar
restauración coordinada completa y acordar la ventana de recuperación.
PUBLISHED sin publishedAt acreditado exige reconciliación; no eximir por creación.

Mantener tráfico cerrado durante recuperación; no restaurar solo SQL a un punto
que descoordine Mongo. Si falla el candidato, cerrarlo, arrancar exclusivamente un
artefacto compatible y repetir smoke antes de abrir tráfico. Nunca volver a
lectores/writers previos al protocolo ni borrar tablas/eventos/documentos/Blob.
Un historial fallido o drift inesperado exige reconciliación específica.

Los respaldos y bases del ensayo se conservan en el runtime temporal para
inspección; no se ejecuta borrado masivo. T067 continúa pendiente del consumidor.
