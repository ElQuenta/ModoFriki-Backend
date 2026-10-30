---
name: modofriki-features
description: Coordina los agentes locales de ModoFriki-Backend para implementar una o más features con contratos, pruebas y revisión. Úsala al pedir desarrollar features con los agentes del proyecto o el flujo de features.
---

Tú orquestas y transmites resultados. Indica a los subagentes que no deleguen.
Usa los roles de `.codex/agents/*.toml`; informa si alguno no está disponible.

1. **Inspección.** Lee `AGENTS.md`, configuración local y archivos exigidos allí.
   Consulta `docs/agents/WORKFLOW.md` si existe; informa su ausencia sin inventarlo.
   Revisa scripts y Git sin descartar cambios. Define alcance y aceptación por feature.
2. **planner.** Autorízale a crear un plan por feature en `docs/features/<nombre>.md`.
   Usa `docs/features/TEMPLATE.md` si existe; en su ausencia incluye API, permisos,
   persistencia, contratos, tareas, propietarios, dependencias y pruebas. Ordena features
   por sus dependencias. Consulta a **architect** si hay decisiones entre capas, módulos
   o bases; devuelve sus conclusiones a planner antes de implementar.
3. **Contratos.** Convoca a **db** si cambia persistencia: fuente de verdad, schemas,
   repositorios y migraciones/recuperación. Convoca a **media** para uploads: autenticación
   → autorización → Multer → validación → Blob → Controller → Service → Repository;
   acuerda `res.locals.uploadedMedia` tipado y compensación. Resuelve contratos compartidos.
4. **Implementación.** Asigna a **dev** API/negocio, a **db** persistencia, a **media**
   middlewares y a **test** pruebas pertinentes. Cada encargo lleva plan, contratos,
   archivos exclusivos, dependencias, aceptación, validaciones y rama/worktree.
   Recuérdales que hay otros agentes y deben respetar sus cambios. Un propietario por archivo.
   Usa ramas feature/agente; nunca commits en main/QA. Dev commitea según su rol;
   solicita expresamente commits a los demás cuando correspondan. En una sesión comparten
   directorio/rama: secuencia escrituras y commits. Para implementaciones paralelas,
   usa sesiones independientes en worktrees distintos. Paraleliza lecturas independientes
   respetando los límites local y efectivo de la sesión.
5. **Validación y revisión.** Revisa entregas antes de integrar ramas en feature.
   **test** ejecuta pruebas sobre el resultado combinado; ejecuta build y comprobaciones
   disponibles. No inventes scripts, confundas build con tests ni instales dependencias
   de test sin aprobación; documenta infraestructura ausente. Pasa plan, diff y resultados
   a **reviewer**. Añade **security** si cambian auth, permisos, datos sensibles o uploads.
   Ambos revisan en solo lectura y pueden hacerlo en paralelo sobre el mismo diff.
6. **Corrección.** Devuelve fallos/hallazgos al propietario y repite validaciones afectadas
   y revisión. Máximo dos rondas; si persisten bloqueos, entrega evidencia y pendientes
   sin declarar éxito. Tú actualizas el plan con resultados y uso de API.
   No ejecutes migraciones destructivas ni integres a QA sin aprobación humana.

Cada agente informa objetivo/resultado, archivos, decisiones, validaciones reales,
riesgos/pendientes, rama y SHA si existe. Cierra con:

| Feature | Etapa | Agente | Resultado y validación |
| --- | --- | --- | --- |

Incluye fallos iniciales/finales de la misma suite (N/D si no se ejecutó), aceptación,
planes y bloqueos. Justifica etapas omitidas; no marques QA aprobado.

Para consultar la evaluación de estos roles, lee [references/evaluacion-agentes.md](references/evaluacion-agentes.md).
