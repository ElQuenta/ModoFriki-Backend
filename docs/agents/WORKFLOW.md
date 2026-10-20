# Protocolo de trabajo con Codex

## Objetivo

Coordinar agentes especializados en un backend existente,
sin romper la arquitectura ni integrar código sin revisión.

## Etapa 1: Auditoría

El coordinador inspecciona:
- Estructura real.
- package.json y scripts.
- Prisma y Mongoose.
- Middlewares y handlers.
- Registro de rutas.
- Convenciones de Git.

No asumir que TankoBase coincide con el proyecto local.

## Etapa 2: Planificación

Delegar en planner.

Crear un plan a partir de docs/features/TEMPLATE.md.

El plan debe contener:
- Objetivo y alcance.
- Contratos de API.
- Decisiones de persistencia.
- Pipeline de middlewares.
- Tareas, propietarios y dependencias.
- Tests y criterios de aceptación.

## Etapa 3: Contratos

DB define schemas y contratos de persistencia.
Media define contrato de res.locals.uploadedMedia.
Dev y Test consumen contratos acordados.

Resolver decisiones compartidas antes de paralelizar.

## Etapa 4: Trabajo paralelo

Usar worktrees distintos para Dev independientes.

Ejemplo, desde una rama base actualizada:

    git switch -c feature/alta-capitulo
    git worktree add -b agent/capitulo-api ../wt-capitulo-api feature/alta-capitulo
    git worktree add -b agent/capitulo-media ../wt-capitulo-media feature/alta-capitulo

Abrir una sesión local de Codex en cada worktree:

    cd ../wt-capitulo-api
    codex

En otra terminal:

    cd ../wt-capitulo-media
    codex

Asignar tareas con archivos disjuntos.

Ejemplo:
- Dev API: controller, service, repository y rutas.
- Media: middleware de subida y pruebas multimedia.
- DB: cambios de schema previamente coordinados.
- Test: pruebas independientes.

Si dos tareas necesitan el mismo archivo,
secuenciar los cambios o definir un único propietario.

Los subagentes de una misma sesión no equivalen
a worktrees separados.

## Etapa 5: Entrega de cada implementador

Cada responsable informa:
- Rama.
- Commit SHA.
- Archivos modificados.
- Validaciones realizadas.
- Riesgos.
- Dependencias pendientes.

No realizar merges desde los agentes trabajadores.

## Etapa 6: Integración controlada

El coordinador:
1. Comprueba que las ramas están actualizadas.
2. Revisa los commits y archivos modificados.
3. Integra en feature mediante cherry-pick o merge revisado.
4. Resuelve conflictos de manera explícita.
5. Ejecuta build, tests y comprobaciones disponibles.
6. Solicita revisión de Reviewer.
7. Solicita Security si hay cambios sensibles.
8. Obtiene aprobación humana antes de QA.

No usar merges automáticos sin revisión.
No descartar cambios para resolver conflictos.
No ejecutar migraciones destructivas automáticamente.

## Etapa 7: QA

La integración en QA solo se propone cuando:
- Se cumplieron criterios de aceptación.
- Se revisaron cambios y migraciones.
- Las pruebas requeridas pasaron.
- Los problemas críticos están resueltos.
- Existe aprobación humana.

## Prompt inicial sugerido

Audita este backend existente siguiendo AGENTS.md.
No modifiques código todavía.
Utiliza planner para diseñar la feature solicitada.
Consulta db para cambios de persistencia y media
para cualquier subida de archivos.
Entrega tareas paralelizables, contratos, archivos
propietarios y criterios de aceptación.
No hagas merges a QA o main.
