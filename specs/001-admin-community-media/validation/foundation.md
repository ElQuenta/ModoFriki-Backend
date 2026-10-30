# Fundamentos compartidos — fase 2, T005–T010

Fecha: 2026-10-30 (America/La_Paz). Rama `feature/admin-community-media-phase-2`, base `6d97d7cfa9d99fc1fa4e9b2d037bd9bc5d2a6276` (`dev`, PR #7 ya integrado). Coordinador: propietario único de implementación; revisión independiente de solo lectura por `foundation_review`. No implementación paralela ni worktrees adicionales.

## Entregables y decisiones

| Tarea | Archivos / resultado |
| --- | --- |
| T005 | `src/types/admin.types.ts`, `sanctions.types.ts`, `comment-creation.types.ts`: actores sin Express, proyecciones explícitas, records Date/DTO ISO, cursores, CAS y repositorios; estados de decisiones y cierres como uniones discriminadas. Sin email/hash/normalizados en DTO administrativo, sin cuerpo/destino de comentario en journal SQL |
| T006 | `src/repositories/user-locks.ts`: valida todos los UUID antes de SQL, normaliza/deduplica/ordena, locks secuenciales parametrizados y clock_timestamp posterior; recibe TransactionClient existente. Exporta readSqlTime para volver a consultar reloj tras locks Work posteriores y opciones maxWait=2s/timeout=5s. No cambia timeout de catálogo ni inicia transacciones/conexiones |
| T007 | `src/middlewares/admin-validation.middleware.ts`: params/query/body Joi con stripUnknown=false, desconocidos rechazados; query compatible con getter Express 5 y respuesta AppError/handler existente sin reflejar valores sensibles. Cuerpo ausente se valida como objeto vacío, manteniendo campos requeridos; validadores existentes intactos |
| T008 | `src/__tests__/helpers/{http,integration,integration-clients,fixtures}.ts`: servidor loopback/puerto efímero/fetch y cierre; clientes compartidos cargados después de guard; UUID propios, cleanup por ID en orden inverso y barreras explícitas. Sin seed, borrado masivo ni dependencias nuevas |
| T009 | `vitest.integration.config.ts`, `vitest.config.ts`, `test-support/integration-environment.ts`: inventarios exclusivos, valores ficticios unitarios conservados, destinos TEST_* obligatorios y verificados antes de importar clientes. Config de integración no hereda URLs unitarias ni credenciales Blob |
| T010 | Pruebas unitarias de locks, validación HTTP/Express y mocks, contratos, guard de destinos y helpers sin proveedores. `tsconfig.foundation.json` comprueba explícitamente tipos de tests/config/helpers que build excluye; no modifica tsconfig funcional |

No se registran rutas de producto nuevas ni se implementan repositorios administrativos/sanciones todavía. Esas capacidades corresponden a fases 3 y siguientes. No cambios en package/lockfile, schema, migraciones, conexiones de producción o `.env`.

## Política ejecutable de destinos

La primera configuración de integración admite únicamente destinos loopback (`127.0.0.1`, `localhost`, `[::1]`) con base `mf_admin_test_<id de ejecución>` (sufijo alfanumérico/minúsculas/guiones bajos de 8–64 caracteres). SQL permite postgres/postgresql y opciones sslmode/schema, con schema public; Mongo permite mongodb y opciones replicaSet/directConnection/authSource/tls. Rechaza parámetros duplicados, otros hosts/esquemas/protocolos, fragmentos y opciones de red no previstas. Mongo exige directConnection=true para impedir descubrir/conectar otros hosts anunciados por el replica set; el helper comprueba primary escribible y setName al conectar. Una ampliación a proveedores remotos necesita política explícita y revisión, no fallback.

Ejemplo sintético para descubrimiento de inventario, no prueba de servicio disponible:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://fixture:synthetic@127.0.0.1:55432/mf_admin_test_inventory?sslmode=disable'
$env:TEST_MONGODB_URI = 'mongodb://127.0.0.1:27027/mf_admin_test_inventory?replicaSet=rs0&directConnection=true'
npx --no-install vitest list --config vitest.integration.config.ts --filesOnly --json
```

Antes de pruebas reales, DB/test verifican propiedad exclusiva del destino y cadena de migraciones; un nombre válido no acredita aislamiento. No usar las bases fijas del compose existente sin preparar/verificar un destino dedicado. Clientes cacheados con otras URLs o conexión Mongo preexistente se rechazan. BLOB_READ_WRITE_TOKEN vacío en integración: esta configuración no habilita pruebas reales Blob.

## Validaciones ejecutadas

- Checklists como gate de solo lectura: requirements 16/16, security 40/40, sin pendientes. Sin `.specify/extensions.yml`: no hooks registrados. Ignore files existentes adecuados; no herramienta adicional que requiera otro ignore.
- Dependencias: `npm ls --depth=0` detectó Vitest/Newman ausentes en la instalación local; `npm ci --ignore-scripts --no-audit --no-fund` restauró 551 paquetes desde lockfile sin cambiarlo. El primer intento de build durante esa instalación no encontró tsc; la validación posterior pasó.
- TDD: los dos tests iniciales de locks/middleware fallaron por módulos todavía ausentes, antes de crearlos; no por conexión a proveedores.
- `npm run build`: PASS. `npm run prisma:validate`: PASS con DATABASE_URL ficticia inyectada, sin conexión. No prisma:generate: schema/output no cambiaron, cliente generado existente reutilizado.
- `npx --no-install tsc -p tsconfig.foundation.json`: PASS. La comprobación explícita detectó y permitió corregir interop de importación dinámica del cliente CJS; expectTypeOf no se presenta como comprobado por Vitest normal solamente.
- `npm test` sin TEST_DATABASE_URL/TEST_MONGODB_URI y con token Blob vacío: PASS, 19 archivos y 372 pruebas. Incluye 36 pruebas nuevas (locks 4, validación 10, guard 15, helpers 4, tipos 3), además de las 336 existentes.
- Inventarios obtenidos con Vitest `list --filesOnly --json`: 19 unitarios, 1 integración, intersección vacía. Descubrimiento de integración usa únicamente URLs sintéticas y no importa tests/clientes. `vitest run --config vitest.integration.config.ts` sin TEST_* falla antes de recoger tests con `TEST_DATABASE_URL is required for disposable integration tests`; rechazo esperado, no suite omitida declarada exitosa.
- Inspección de imports: únicamente `environment.integration.test.ts` importa `helpers/integration`; unitarias usan primitives sin proveedores de fixtures/http o guard puro. No importación del helper de clientes reales desde unitarias.
- `git diff --check`: PASS. Enlaces relativos y fences del informe verificados. Sin cambios en dependencias/schema ni generación manual.

Inventario unitario (`src/`):

```text
__tests__/{integration-environment,test-helpers}.test.ts
controllers/__tests__/catalog.controller.test.ts
middlewares/__tests__/{admin-validation,auth.middleware,role.middleware,validate.middleware}.test.ts
middlewares/schemas/__tests__/{auth,catalog,community,discovery,reading}.schema.test.ts
repositories/__tests__/user-locks.test.ts
services/__tests__/{auth,catalog,community,discovery,reading}.service.test.ts
types/__tests__/admin-contracts.test.ts
```

Inventario integración: `src/__tests__/environment.integration.test.ts`, preflight real de solo lectura de reloj SQL/replica set, pendiente de ejecutar sobre destinos acreditados. No migraciones/fixtures persistidos por este archivo.

## Revisión y límites

Reviewer detectó riesgo de descubrimiento Mongo hacia hosts no verificados; corregido con directConnection=true y pruebas de omisión/false. Confirmó cierre del hallazgo y ausencia de defectos materiales pendientes en contratos, locks, validación, fixtures y separación de suites. El coordinador añadió también comparación de configuración cacheada antes de conectar. Revisión estática, sin conexiones por el revisor.

No se ejecutaron proveedores reales, carreras SQL/Mongo, migraciones, seed, reset, db push ni subidas Blob. Los mocks prueban orden de llamadas y fallos, no bloqueo real, durabilidad, revocaciones concurrentes o transacción distribuida. Baseline discrepante sigue pendiente de reconciliación específica antes de aplicar migraciones. Esos límites no impiden aceptar los fundamentos de fase 2; bloquean las garantías de historias que necesitan sus pruebas reales. QA, despliegue y aceptación del consumidor mantienen sus gates posteriores.
