---
name: modofriki-feature
description: Flujo completo para implementar una feature del backend ModoFriki con los 8 roles de AGENTS.md como subagentes. Etapas — auditoría; planner (plan con TEMPLATE.md; architect solo si hay una decisión estructural); rama feat/<feature>; db → media → dev con archivos propios disjuntos; test; reviewer + security en paralelo; máximo 2 rondas de corrección; entrega y merge a dev con OK humano. Usar cuando el usuario pida implementar o avanzar una feature o recurso del backend (base, schema, auth, genres-tags, works, chapters, favorites, comments, users, uploads) o invoque /modofriki-feature.
argument-hint: "<feature>: base | schema | auth | genres-tags | works | chapters | favorites | comments | users | uploads"
---

# Feature de backend: $ARGUMENTS

Eres el **coordinador**, como en `docs/agents/WORKFLOW.md`: delegas en los subagentes y no implementas tú lo que es de un rol. Los subagentes comparten esta carpeta y esta rama, así que se ejecutan **en serie** cuando editan y **en paralelo** solo cuando únicamente leen. Cada uno toca solo sus archivos (tabla de `CLAUDE.md`).

## 1. Auditoría (tú, sin editar)
- Corre `git status` y `git branch --show-current`. Si hay cambios sin commit que no son de esta feature, detente y pregunta.
- Lee `docs/API.md` (la parte que corresponde a esta feature) y los planes ya hechos en `docs/features/`.
- Respeta las dependencias: `base` (middlewares, CORS, 404, `/api/docs`, logs sin credenciales) y `schema` (schema completo + `db push` + seed) van antes que cualquier recurso. Si faltan, propón hacerlas primero.

## 2. Plan → `planner`
- Escribe `docs/features/<feature>.md` con la plantilla.
- Si el plan deja una decisión estructural abierta, consulta a `architect`. Si su recomendación cambia el contrato, decide el usuario.
- Muéstrale al usuario un resumen de 5 líneas y sigue, salvo que objete el alcance.

## 3. Rama
`git switch dev`, `git pull` y `git switch -c feat/<feature>` (o `git switch feat/<feature>` si ya existe).

## 4. Implementación, en este orden, solo los roles que el plan necesita
1. `db`: schema, `db push`, seed, modelos y repositorios. Pásale el plan y las firmas de repositorio esperadas.
2. `media`: middlewares de upload y Blob, solo si la feature sube archivos.
3. `dev`: validaciones, services, controllers, routes, `app.ts` y `openapi.yaml`. Pásale la entrega de `db` y de `media` (firmas exactas).

Si un rol reporta que necesita algo de otro, devuélvele la tarea al dueño. No permitas que un rol edite archivos ajenos.

## 5. Verificación → `test`
- Si `localhost:3000/health` no responde, levanta `npm run dev` en segundo plano y detenlo al cerrar la feature.
- Cada ❌ vuelve a su dueño (`db`, `media` o `dev`) con la evidencia.

## 6. Revisión → `reviewer` (+ `security` en paralelo si la feature toca auth, permisos, uploads o datos de usuarios)
- Los hallazgos CRÍTICA, ALTA y MEDIA vuelven a su dueño, y después se repite `test` y la revisión.
- Máximo **2 rondas** de corrección. Si sigue fallando, detente y reporta al usuario.

## 7. Entrega e integración
- Corre `npx tsc --noEmit` y `npm run build`, y anota el resultado real.
- Completa la sección "Integración" del plan: rama, commits y resultados.
- Muéstrale al usuario el reporte del "Contrato de entrega" de `AGENTS.md`:
  - Objetivo y resultado.
  - Archivos tocados por rol.
  - Decisiones tomadas.
  - Validaciones ejecutadas, con su resultado real.
  - Riesgos y pendientes.
- Con su **OK**: commit `feat(<feature>): …` en `feat/<feature>`, `git switch dev`, `git merge --no-ff feat/<feature>` y `git push origin dev`. Nunca a `main` ni a `qa`; el hook también lo bloquea.
- Nunca afirmes que una prueba pasó si no se ejecutó.

## Orden del MVP
`base` → `schema` → `auth` → `genres-tags` → `works` → `chapters` → `favorites` → `comments` → `users` → `uploads` (`POST` de works y chapters a Vercel Blob).
