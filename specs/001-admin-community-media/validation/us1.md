# Validación US1 — roles y asignaciones protegidas

Fecha: 2026-10-30 (America/La_Paz). Rama `feature/admin-community-media-phase-3`, base `d2024d4` (`dev`, PR #8 integrado). Alcance T011–T022: administración BASIC/EDITOR, asignaciones editoriales versionadas, auditoría, locks de catálogo y documentación. No se modificaron `.env`, secretos, bases compartidas, QA o main.

## Entrega y propiedad

| Bloque | Responsable | Resultado integrado |
| --- | --- | --- |
| T011–T012 | test/coordinador | Pruebas unitarias, HTTP y PostgreSQL real para DTO, autorización, CAS, cursores, rollback, reasignación y carreras |
| T013 | DB (`agent/admin-community-media-db`) | Schema y migración aditiva; commit de agente `acfd4e8`, cherry-pick `7ee78e5` |
| T014–T018 | admin (`agent/admin-community-media-admin`) | Joi, repository, service, controller y seis rutas; commit de agente `3567e02`, cherry-pick `458eaf7` |
| T019 | media (`agent/admin-community-media-media`) | Locks User→Work y revalidación de permisos en catálogo; commit de agente `978dda7b`, cherry-pick `51dd17c` |
| T020–T022 | coordinador/reviewer | Router raíz, lectura compatible, API/OpenAPI, evidencia y revisión independiente |

Los worktrees evitaron edición concurrente de los mismos archivos. Los subagentes no integraron en `dev`, QA o main. El coordinador revisó y cherry-pickeó únicamente sus commits de propiedad.

## Comportamiento demostrado

- Un ADMIN activo lista/detalla cuentas no eliminadas mediante una proyección sin email, normalizados, hash ni `deletedAt`.
- Solo se aceptan roles gestionados BASIC/EDITOR. La cuenta ADMIN propia o ajena permanece protegida.
- `expectedUpdatedAt` y `expectedVersion` se comprueban antes de un no-op; una precondición antigua devuelve 409.
- La degradación a BASIC revoca todas las asignaciones activas, incrementa sus versiones y escribe `ROLE_CHANGED`/`EDITOR_REVOKED` en la misma transacción. Volver a EDITOR no restaura relaciones.
- Asignar exige EDITOR ACTIVE y obra no eliminada. Revocar admite editor suspendido y relación histórica; reasignar conserva id/createdAt y actualiza assignedAt/version.
- Cursores usan `(createdAt,id)` ascendente y estable, incluso con timestamps empatados o reasignaciones.
- Catálogo toma locks User antes de Work y vuelve a consultar rol/asignación bajo esos locks. Las compensaciones de upload conservan el mismo orden sin exigir permisos ya revocados. El save de capítulos mantiene timeout de 30 segundos.
- Las mutaciones autenticadas de lectura también toman User antes de Work, evitando el orden inverso respecto de catálogo/admin.

## TDD y pruebas unitarias/HTTP

El primer run focalizado falló únicamente por módulos ausentes (`admin.service` y `admin.routes`), antes de implementar T014–T018. Después:

- `npx vitest run src/services/__tests__/admin.service.test.ts src/routes/__tests__/admin.routes.test.ts`: PASS, 2 archivos y 78 pruebas.
- `npm test`: PASS, 21 archivos y 450 pruebas. La configuración normal excluye `*.integration.test.ts`.
- `npm run build`: PASS.
- `npx tsc -p tsconfig.foundation.json`: PASS tras incluir explícitamente las tres suites US1.
- `npm run prisma:validate`: PASS con Prisma 7.10.1.
- `npm run prisma:generate`: PASS; cliente generado desde `prisma/schema.prisma`, sin edición manual.
- Parseo de `openapi.yaml` y resolución de referencias internas: PASS, 37 paths, 231 referencias y seis rutas admin.
- `git diff --check`: PASS.

## PostgreSQL real y migración

Se descargó el archivo binario oficial PostgreSQL 17.11 en una carpeta temporal de la máquina y se inició un cluster desechable en loopback. No se instaló un servicio del sistema ni se usaron credenciales/base compartida. El servidor se detiene al finalizar esta fase.

Destino limpio dedicado `mf_admin_test_phase3run`:

- `prisma migrate deploy`: PASS, cuatro migraciones aplicadas en orden, incluida `20261029000100_admin_assignments`.
- `npx vitest run --config vitest.integration.config.ts src/repositories/__tests__/admin.integration.test.ts`: PASS, 15 pruebas SQL reales.
- Incluye no-op/stale, reloj monotónico, filtros/cursores empatados, auditoría y revocaciones atómicas, rollback real por fallo de auditoría, reasignación estable, actor SQL revalidado y CAS concurrente con exactamente un ganador.
- Dos barreras deterministas pausan degradación/revocación después de adquirir locks reales. `pg_stat_activity` confirma que el guardado de catálogo espera un lock SQL; al liberar, la operación administrativa gana y el guardado tardío termina 403 sin cambiar la obra.

Destino histórico dedicado `mf_admin_test_phase3history`:

- Se creó `Example`, se aplicaron las tres migraciones anteriores, se insertó una relación histórica y luego se ejecutó el SQL exacto de T013.
- Resultado: `version=1`, `createdAt=assignedAt`, `Example` conserva su fila y el CHECK rechaza `version=0`.
- UNIQUE `(workId,editorId)`, FK RESTRICT e índice previo permanecen en la migración base; el nuevo índice `(editorId,createdAt,id)` existe.

El primer intento deliberado de `prisma migrate deploy` sobre una base no vacía con solo `Example` devolvió P3005, tal como anticipa la discrepancia del baseline. No se usó `migrate resolve`, reset, db push ni una marca falsa. La cadena oficial se acreditó en el destino limpio y la preservación histórica mediante los SQL exactos en el destino histórico.

## Criterios y revisión

| Criterio | Evidencia |
| --- | --- |
| FR-001–FR-002 | Rutas/servicio/repository y matriz unit/HTTP/SQL para listado y roles protegidos |
| FR-003–FR-005 | Assign/revoke/reassign versionados, downgrade atómico, auditoría y carreras reales |
| FR-021 | Revalidación de permisos dentro de transacciones y orden global User→Work |
| SC-001–SC-003 | Seis rutas demostrables, proyección segura, CAS/auditoría/rollback y paginación estable |
| SC-008 | Dos carreras reales muestran que una revocación/degradación ganadora impide el commit editorial posterior |

Reviewer independiente `phase3_review` recomienda aceptar T022/US1 y no encontró hallazgos bloqueantes, altos ni medios. Repitió `npm test` (21/450), build, Prisma validate, typecheck foundation y la suite SQL (15/15). Confirmó capas, orden de middlewares, allowlists, locks User→Work, CAS antes de no-op, atomicidad y migración aditiva.

Riesgos bajos aceptados y explícitos: el reordenamiento User→Work de las mutaciones de lectura no tiene una prueba unitaria específica, aunque compila y la inspección confirma el orden; `WorkEditorAssignment.createdAt` es inmutable mediante el allowlist de repository/API y las pruebas de revocación/reasignación, no mediante trigger SQL. No hay una vía de producto que permita modificarlo. QA y merge siguen fuera de alcance; el PR de esta fase apunta a `dev` y no se fusiona automáticamente.
