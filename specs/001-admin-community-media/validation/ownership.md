# Propiedad y orden de integración — T003

Fecha: 2026-10-30. Rama creada desde checkout `dev`, HEAD base `1a7bfba237da6b3d8d496c1d1f6ff3051f7451f1`: `feature/admin-community-media`. Cambios previos del usuario preservados. Sin commits, merge, push o integración a QA.

Fase 1 ejecutada por el coordinador. Única delegación: reviewer `requirements_review`, solo lectura y evaluación documental; sin archivos de implementación asignados ni worktree. No hay implementadores paralelos; por eso no se crean sesiones/worktrees de implementación todavía.

| Responsable | Propiedad futura exclusiva | Rama / worktree si se delega implementación |
| --- | --- | --- |
| DB | schema, migraciones, tipos iniciales y user-locks | agent/admin-community-media-db / ../wt-mf-db |
| Admin | repository/service/controller/router admin, schemas y wrapper estricto | agent/admin-community-media-admin / ../wt-mf-admin |
| Community | sanciones/decisiones y repos/services/models/scripts de comunidad | agent/admin-community-media-community / ../wt-mf-community |
| Media | catálogo y locks de catálogo, receiver, media-paths y tipos afectados | agent/admin-community-media-media / ../wt-mf-media |
| Test | Helpers/config/tests propios, evidencia; reservar tests existentes antes de editar | agent/admin-community-media-test / ../wt-mf-test |
| Coordinador | app/auth router, API/OpenAPI, evidencia y coordinación | feature/admin-community-media / checkout actual |
| Reviewer/security | Lectura e informes; correcciones de código se devuelven a owners | Sesiones de solo lectura |

Las ramas/worktrees de la tabla son reservas documentadas, no recursos creados. Un subagente compartiendo este directorio no cuenta como sesión aislada. Antes de delegar código: crear checkout aislado, fijar propietario de cada archivo, verificar base y cambios, comunicar que no debe revertir trabajo ajeno. Ningún worker integra por su cuenta.

## Secuencia y aceptación

T001→T002→T003→T004. Después: T005–T010, antes de historias. DB entrega tipos/schema antes de consumidores. Migraciones se serializan T013→T026→T046; media conserva propiedad única de catálogo T019→T047→T049–T052; documentos compartidos T020→T038→T053→T057→T060. Seguir dependencias puntuales de tasks.md; [P] no permite escrituras simultáneas sobre un mismo archivo.

Cada incremento entrega archivos, contratos, resultados reales, riesgos, rama y SHA si existe commit. Coordinador revisa diff/commits, resuelve conflictos conservando cambios y ejecuta checks pertinentes antes de integrar en feature. QA requiere revisión, evidencia backend/consumidor y aprobación humana final; no hay integración autorizada por completar fase 1.

## Entrega por fase autorizada

El 2026-10-30 el usuario solicitó commits y un PR hacia `dev` por cada avance de fase. Al completar cada fase: ejecutar validaciones correspondientes, registrar resultados, crear commit en rama feature y publicar PR con base `dev`, alcance y limitaciones explícitos. La fase 1 se entrega desde `feature/admin-community-media`; para las siguientes fases usar ramas separadas y evitar incluir otra vez cambios de un PR anterior. Si el PR previo sigue abierto, documentar la dependencia y revisar el diff contra `dev` antes de publicar el siguiente. Abrir un PR no autoriza fusionarlo automáticamente ni integrar en QA/main.

Fase 2: `feature/admin-community-media-phase-2` desde `dev` en `6d97d7c` (PR #7 ya integrado). Coordinador conserva propiedad de todos los archivos T005–T010; reviewer `foundation_review` solo lectura, sin implementación paralela. [foundation.md](foundation.md) registra archivos, validaciones, hallazgo corregido y límites.

Fase 3: `feature/admin-community-media-phase-3` desde `dev` en `d2024d4` (PR #8 ya integrado). Se crearon worktrees aislados `../wt-mf-{test,db,admin,media}` con sus ramas reservadas. Test entregó T011–T012 (`bf5c050`), DB T013 (`acfd4e8`), admin T014–T018 (`3567e02`) y media T019 (`978dda7b`); cada uno editó solo sus archivos asignados. El coordinador integró esos commits en la rama feature, asumió T020–T022 y la corrección de orden de locks en lectura, ejecutó PostgreSQL desechable y solicitó revisión final de solo lectura a `phase3_review`. Evidencia completa en [us1.md](us1.md).
