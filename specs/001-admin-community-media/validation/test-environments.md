# Entornos y pruebas futuras — T004

Fecha: 2026-10-30. Plan de destinos desechables, no aprovisionamiento ni validación de servicios. Ninguna conexión, migración, seed, reset, db push, subida o eliminación ejecutada.

## Inventario y estado

| Proveedor | Destino previsto / aislamiento | Estado real y responsable |
| --- | --- | --- |
| PostgreSQL | Instancia desechable propia por ejecución; DB con prefijo mf_admin_test y sufijo de ejecución, host/puerto local verificado. Referencia compose existente: postgres:16-alpine, puerto 55432, DB modofriki | Config local inspeccionada; servicio, disponibilidad e historial no comprobados. DB/test verifican propiedad antes de migrar |
| MongoDB | Replica set desechable rs0, DB mf_admin_test con sufijo de ejecución. Referencia compose: mongo:7, puerto 27027, replSet rs0 | Compose declara replica set; inicialización/primary/transacciones no comprobados. Community/test verifican capacidad real |
| Vercel Blob | Almacén/token exclusivamente de pruebas y namespace por ejecución, sin activos compartidos | No hay destino ni token de test acreditado. Media/test deben identificar almacén autorizado antes de pruebas reales; mientras tanto adaptador simulado |

Los nombres mf_admin_test describen destinos futuros, no bases creadas. El compose existente tiene nombres fijos compartibles entre ejecuciones locales: no asumir exclusividad. Si está en uso, preparar instancia/puerto propios antes de cualquier escritura. No reutilizar bases de desarrollo/producción ni inferir seguridad del nombre o NODE_ENV=test.

## Variables e importación segura

En T009, configuración de integración exige TEST_DATABASE_URL y TEST_MONGODB_URI inyectadas mediante sesión o secretos CI; no fallback a DATABASE_URL/MONGODB_URI de desarrollo ni a valores ficticios de unitarias. Validar destino contra inventario desechable y propiedad antes de importar clientes. Mapear variables requeridas por env.ts antes de importación, reutilizando clientes existentes. SQL local sin TLS requiere sslmode=disable explícito; preservar TLS en clientes normales. Mongo debe confirmar primary y replica set, sin fallback standalone.

JWT_SECRET de tests debe ser sintético; Blob real usa BLOB_READ_WRITE_TOKEN solo del almacén de test autorizado. Nunca copiar credenciales compartidas, editar .env, imprimir variables/URIs completas ni registrar tokens. Registrar alias del destino, motor, versión observada y ejecución; secretos solo en memoria/CI. Ausencia o destino no autorizado debe producir fallo explícito, no pruebas omitidas declaradas exitosas.

Vitest actual solo tiene configuración unitaria con URLs ficticias y todavía no excluye archivos integration.test.ts. T009 debe separar inventarios conservando exclusiones predeterminadas: npm test sin TEST_* ni conexiones reales; integración solo src/**/__tests__/**/*.integration.test.ts, helpers reales sin importación desde unitarias. Verificar intersección vacía antes de ejecutar suites reales.

## Historial y baseline

prisma/README.md cita 20261019000000_existing_example, que no existe localmente. Directorio inspeccionado: 20261019000100_core_domain, 20261019000200_chapter_read_receipts, 20261020000100_work_visits_count y migration_lock.toml. Eso no prueba historial de ningún servidor.

DB debe comparar SQL local, estructura Example, secuencia/default/tipo y restricciones, historial _prisma_migrations y drift únicamente en destino desechable verificado. No ejecutar resolve para ocultar la discrepancia, reset, db push o seed. Si cadena local no puede aplicarse a DB vacía, registrar fallo y diseñar reconciliación específica revisada antes de acreditar migraciones. Preservar Example y todos los FK/CHECK/índices adicionales; respaldo/restauración y recuperación compatible se ensayan en T062. Ninguna aplicación a base compartida queda autorizada por este documento.

No ejecutar test:env:up como setup: postman/test-env.mjs migra y ejecuta seed administrativo automáticamente. test:env:down elimina entorno y no es teardown de fixtures de esta feature. No se modifican esos scripts existentes.

## Fixtures, barreras y limpieza

Test crea UUID propios y namespace de ejecución; actores ADMIN/BASIC/EDITOR ACTIVE/SUSPENDED/DELETED mediante fixtures acotados, sin seed operativo. Registrar IDs creados y limpiar únicamente recursos de esa ejecución respetando FK; sin borrados masivos ni recursos ajenos. Provisionales y Blob conservan política de feature: fixtures no autorizan purgas operativas.

T008 proporciona barreras explícitas por promesas/señales en boundaries de repositorio, sin sleeps como evidencia. Pausar después de prepare, durante stage y antes de finalize; confirmar sanción o retirada del destino y liberar escritura tardía. Probar también orden inverso. Carrera SQL usa conexiones independientes y locks reales User→Work; no Promise.all dentro de sesión Mongo transaccional. Cuenta/hora se verifican después de locks con reloj SQL; comprobar frontera endsAt, CAS y no resurrección.

Cubrir commit SQL incierto, timeout/crash Mongo y recuperación primary/majority; fixtures de páginas vacías y confirmación detrás del cursor. Mock verifica ramas de lógica, no durabilidad ni concurrencia reales. Guardado de capítulo mantiene timeout 30s y regresión 1000 páginas.

## Condiciones pendientes de ejecución

DB/test acreditarán destinos/versiones, compatibilidad, historial y fixtures antes de integración; media identificará Blob de test antes de cargas reales. Destinos no preparados no bloquean esta tarea documental, pero sí las pruebas que los requieren. T004 no acredita proveedores, baseline reconciliado, migraciones aplicadas, carreras superadas o permisos de despliegue. Consumidor y QA mantienen gates posteriores separados.
