# Checks finales

Fecha: 2026-10-30. Rama: `feature/admin-community-media-phase-7`.

| Comando | Resultado |
| --- | --- |
| `npm run prisma:validate` | Correcto |
| `npm run prisma:generate` | Correcto |
| `npm run build` | Correcto |
| `npm test` | 27 archivos, 494 pruebas correctas; no requiere `TEST_*` ni proveedores reales |
| `npx vitest run --config vitest.integration.config.ts` | 9 archivos, 53 pruebas correctas en PostgreSQL/MongoDB desechables |

Las configuraciones unitarias e integración usan inventarios separados. La
configuración de integración rechaza destinos que no sean bases locales
dedicadas. Los destinos concretos se omiten para no registrar credenciales.

La prueba `comment-decision-scale.integration.test.ts` insertó 10 000 cuentas y
10 000 decisiones en lotes de 500 y comprobó dos lecturas limitadas a 100 filas;
pasó en 7,3 s contra PostgreSQL desechable. Esta cobertura demuestra el acceso
por lotes de este escenario, sin presentar métricas como garantía universal de
rendimiento.
