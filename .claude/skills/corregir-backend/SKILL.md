---
name: corregir-backend
description: Ejecuta las pruebas de API del backend ModoFriki, corrige en la causa raíz los bugs que encuentre (delegando en el rol dueño de cada archivo), vuelve a probar hasta que pasen y entrega un reporte de cambios. No hace commit. Usar cuando el usuario pida corregir los fallos de las pruebas de API/Postman, arreglar los errores del backend detectados por las pruebas o invoque /corregir-backend.
argument-hint: "[carpeta opcional: \"05 Comunidad\"]"
---

# Corregir el backend: $ARGUMENTS

Eres el **coordinador**, como en `/modofriki-feature`: los arreglos los hace el rol dueño de cada archivo (tabla de `CLAUDE.md`), no tú.

## 1. Rama y punto de partida
- `git status`: si hay cambios sin commit ajenos a esto, detente y pregunta.
- Si estás en `dev`, `main` o `qa`, crea `fix/api-<resumen>` desde `dev` (`git switch dev && git pull && git switch -c fix/api-...`).

## 2. Probar
Sigue los pasos 1 y 2 de `.claude/skills/probar-backend/SKILL.md` (entorno + `tester-api`). Si no hay fallos, termina: "Nada que corregir".

## 3. Triage (tú, con el reporte)
| Tipo | Qué haces |
| --- | --- |
| 🐛 Bug | Se corrige (paso 4) |
| 🧪 Prueba desactualizada | **No** toques la colección. Lístala en el reporte con la evidencia del contrato. Solo el usuario decide si se cambia la prueba |
| ⚙️ Entorno | Arregla el entorno (fixtures, servidor, Docker) si está a tu alcance; si no, repórtalo |
| Duda | Pregunta al usuario antes de tocar nada |

Regla de oro: **nunca cambies una prueba ni el contrato (`docs/API.md`, `openapi.yaml`) para que algo pase**. Si el código y el contrato discrepan, manda el contrato salvo que el usuario diga lo contrario.

## 4. Corregir → rol dueño
Por cada bug (agrupa los que comparten causa):
1. Delega en el dueño del archivo (`dev`, `db` o `media`) con: el fallo, la respuesta real, el archivo:línea probable y esta instrucción: *"busca la causa raíz, revisa todos los llamadores de la función que vas a tocar, haz el cambio mínimo y no edites archivos fuera de tu tabla"*.
2. El hook ejecuta `tsc --noEmit` tras cada edición. Si falla, vuelve al mismo dueño.
3. Re-prueba solo lo afectado con `tester-api` (carpeta `01 Auth` + la carpeta del fallo).
4. Máximo **2 rondas** por bug. Si sigue fallando, márcalo como pendiente con lo intentado y continúa con el siguiente.

## 5. Verificación final
Todo esto con resultado real:
- `tester-api` con la colección completa (que no se haya roto otra cosa).
- `npm test` (unit tests) y `npm run build`.
- `reviewer` sobre el diff (y `security` en paralelo si se tocó auth, permisos o uploads). Los hallazgos CRÍTICA, ALTA y MEDIA vuelven al dueño y cuentan como una ronda más.

## 6. Reporte (no hagas commit)
- Resultado antes → después (X/Y aserciones).
- Por cada bug corregido: causa raíz, archivo:línea, rol que lo arregló y la prueba que ahora pasa.
- Pruebas desactualizadas, dudas y pendientes.
- Validaciones ejecutadas con su resultado real.
- Siguiente paso para el usuario: revisar `git diff` y, con su OK, `commit fix(api): …` y merge `--no-ff` a `dev` (como en `CLAUDE.md`). **Nunca hagas commit, merge ni push sin ese OK.**
