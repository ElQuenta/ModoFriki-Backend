# US2 — validación final

Fecha: 2026-10-30.

- `npm run prisma:validate`: correcto.
- `npm run prisma:generate`: correcto.
- `npm run build`: correcto.
- `npm test`: 26 archivos, 489 pruebas aprobadas.
- `npx vitest run --config vitest.integration.config.ts`: 9 archivos, 53 pruebas aprobadas con PostgreSQL y MongoDB replica set desechables.
- `git diff --check`: correcto.

La migración crea `CommentSanction` y `CommentCreationDecision` con FK, CHECK e índices. Las pruebas reales cubren sanciones, revocación, expiración, auditoría, decisiones terminales, huella, evidencia, staging durable, replay y `TARGET_UNAVAILABLE`. El journal SQL guarda permiso, estado, actor y hash; nunca Markdown ni snapshots de evidencia.

FR-006–012/022 y SC-004/009 fueron revisados: rutas con guards antes de Joi, controllers sin persistencia, Services sin Express y separación PostgreSQL/Mongo. El corte sin writers/readers antiguos es obligatorio. Las pruebas simuladas no sustituyen las carreras reales de `us2-concurrency.md`.
