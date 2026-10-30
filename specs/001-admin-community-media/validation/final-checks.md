# Checks finales — T061/T065

Fecha: 2026-10-30. Rama `feature/admin-community-media-phase-7`, base
`1b134ffdacfe7ec8374be05f30583a4743e6b7c6`, cambios actuales sin commit.

| Comprobación tras las correcciones | Resultado |
| --- | --- |
| `npm run prisma:validate` | PASS, Prisma 7.10.1 |
| `npm run prisma:generate` | PASS, output existente src/generated/prisma |
| `npm run build` | PASS, TypeScript estricto |
| `npm test` sin ambas variables TEST_* | PASS, 30 archivos / 511 pruebas |
| `npx vitest run --config vitest.integration.config.ts` con destinos explícitos | PASS, 11 archivos / 57 pruebas SQL/Mongo reales |
| `node test-support/check-test-isolation.mjs` | PASS, inventarios 30/11, intersección 0; destinos ausentes fallan antes de colección |
| `node test-support/check-api-contract.mjs` | PASS, 40 paths / 59 operaciones / 297 referencias; parámetros path declarados |
| `node test-support/deployment-rehearsal.mjs <runtime.json> <rollback-entry>` | PASS; ensayo y JSON vinculados |
| `git diff --check` | PASS; avisos LF/CRLF sin errores de whitespace |

PowerShell requirió `npm.cmd` y Node real 24.22.0 para evitar el shim NVM sin
versión y la ejecución deshabilitada de .ps1. No se modificó la política del
sistema. PostgreSQL arrancó con aprobación fuera del sandbox después de que
pg_ctl fallara por el token restringido.

Integración: PostgreSQL 17.11 loopback:62350, MongoDB 8.0.34:62351 replica set
mf_phase7, DB `mf_admin_test_phase7final` en ambos. Se inyectaron variables solo
a procesos de pruebas; no se publican credenciales ni URI de aplicación.
Siete migraciones aplicadas en esa base nueva; sin seed/reset/db push ni bases
compartidas. Unitarias usan URLs ficticias de vitest.config.ts.

La suite de escala insertó 10 000 cuentas y decisiones en lotes de 500 y verificó
lecturas acotadas a 100 sin N+1. Archivo 7,423 s; caso 4,203 s. Es evidencia del
escenario local, no un SLA. Se conservaron regresiones de auth/community/catalog/
reading/discovery y las suites de miniaturas/cleanup incorporadas desde dev.

Nuevas regresiones: wiring de evidencia de producción; fechas inexistentes o sin
zona; WebP no decodificable y formatos válidos; replay COMMITTED tras edición o
borrado; dependencia Mongo indisponible. Dos casos de replay también se ejecutaron
sobre SQL/Mongo reales. Mongo emitió avisos de deprecación de findOneAndUpdate
con new; no hubo fallos.

No se ejecutaron llamadas reales a Vercel Blob: falta almacén de test autorizado.
Los adaptadores simulados no prueban ese proveedor. No hay script npm de lint.
Las cifras anteriores 494/53 son evidencia histórica; esta tabla refleja el
checkout actual con miniaturas y las nuevas regresiones.
