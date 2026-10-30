# Preflight de fase 1 — T001

Fecha: 2026-10-30 (America/La_Paz). Inspección local, sin consultar proveedores ni leer `.env`.

## Estado y fuentes inspeccionadas

- Checkout inicial: `dev`, HEAD `1a7bfba237da6b3d8d496c1d1f6ff3051f7451f1`. Existían cambios del usuario en `checklists/security.md` y `plan.md` (actualización de referencias a tasks); se conservan.
- `package.json`, `package-lock.json`, `tsconfig.json`, `prisma/schema.prisma`, `prisma.config.ts`, `prisma/README.md` y nombres de migraciones locales.
- `src/config/env.ts`, `src/config/database/{postgres,mongodb,uri}.ts`, `src/app.ts`, `src/index.ts`; routers auth/community/catalog y registro de reading/discovery.
- Handlers success/error, `AppError`, logger, media-paths; middlewares auth/role/validateQuery/catalog y pipeline media receive/upload/types/image-validation; persistencia de catálogo y timeout de ChapterRepository.
- `vitest.config.ts`, `.gitignore`, `docker-compose.test.yml`, `postman/test-env.mjs`, `AGENTS.md`, `docs/agents/WORKFLOW.md`, constitución y documentos de feature.

## Versiones y scripts reales

Runtime observado: Node `v24.22.0`, npm `12.2.0`. Lockfile: TypeScript 7.0.2, Express 5.3.0, Prisma/client/adapter-pg 7.10.1, pg 8.23.1, Mongoose 9.11.2, Joi 18.3.0, Multer 2.4.0, Blob 2.8.2, Vitest 3.2.4, YAML 2.9.1. No instalación ni actualización.

| Script | Comando | Uso en esta fase |
| --- | --- | --- |
| build | tsc | No ejecutado; solo documentos |
| test | vitest run | No ejecutado; solo documentos |
| prisma:validate / prisma:generate | prisma validate / prisma generate | No ejecutados; schema sin cambios |
| prisma:migrate | prisma migrate dev | No ejecutar sobre base compartida |
| prisma:deploy | prisma migrate deploy | Requiere destino y migraciones revisados |
| prisma:seed | prisma db seed | No usar para fixtures de feature |
| prisma:studio | prisma studio | No ejecutado |
| dev / start / prestart | nodemon / node dist/index.js / npm run build | No se arranca servidor |
| test:env:up / server / down | node postman/test-env.mjs con acción correspondiente | No ejecutados: up migra/seed y down elimina entorno |
| test:api | newman con colección/entorno local y reporte JSON | No ejecutado |

No hay script lint. TypeScript strict, ES2022/NodeNext; tests excluidos de build. No cambiar configuración funcional.

## Convenciones y decisiones

Prisma usa `prisma-client`, output `src/generated/prisma`, URL desde `prisma.config.ts`; cliente compartido PrismaPg con TLS por defecto. El test local SQL requiere `sslmode=disable`. Mongo reutiliza Mongoose; respuestas requieren replica set. No se ha comprobado la versión de ningún servidor.

Rutas bajo `/api`: auth, community, discovery, catalog, reading; Swagger en `/api/docs`. `/health` devuelve ok sin probar proveedores. `index.ts` conecta bases desde callback de listen: no se toma como garantía de readiness. Handlers mantienen envelopes y AppError; factories/inyección ya disponibles.

Auth entrega identidad vigente en `res.locals.user`; authorize verifica rol. Nuevas validaciones estrictas no deben reutilizar `validateQuery` con stripUnknown=true. El pipeline autoriza antes de Multer, usa temporales y límites, valida imágenes y entrega `res.locals.uploadedMedia`. Actualmente obra admite cover/inpagecover, no banner. Se conserva journal/Blob abandonado; borrado limitado a páginas sustituidas. Catálogo toma Work antes de reautorizar: T019 debe normalizar User→Work. Save de capítulos conserva timeout 30s.

No existen todavía sanciones/decisiones SQL ni versión/createdAt de asignación. `Example` se conserva. README cita baseline `20261019000000_existing_example`, ausente en carpeta local; presentes core_domain, chapter_read_receipts y work_visits_count. No inferir historial real ni ejecutar resolve para disimularlo.

`.gitignore` cubre node_modules, dist/build, logs, temporales, entornos y cliente generado. Sin Dockerfile, ESLint, Prettier, Terraform o Helm detectados; compose de pruebas no necesita contexto de build. No se prepara publicación npm ni se crea npmignore.

## Validación y límites

Ejecutados: inspección textual, lectura selectiva del lockfile con Node, `node --version`, `npm --version`, `git status`, `git diff` y `git log -1`. Sin tests de aplicación, generación, migraciones, seed, conexiones o subidas. La revisión de requisitos se registra aparte; no acredita comportamiento implementado.

Cierre de fase: `git diff --check` sin errores (Git avisa de normalización LF/CRLF); comprobación local de enlaces relativos y fences Markdown conforme; checklists requirements 16/16 y security 40/40; únicamente T001–T004 marcadas completas. `.specify/extensions.yml` no existe: no hay hooks pre/post que despachar. Rama final `feature/admin-community-media`, mismo HEAD base y sin commit nuevo. Validaciones de proveedores y aceptación del consumidor siguen pendientes de sus fases.
