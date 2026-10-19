# Evaluación de agentes locales

Evaluación estática realizada el 19 de octubre de 2026 sobre los ocho archivos
`.codex/agents/*.toml`, `AGENTS.md`, el workflow y la plantilla de features.
No se ejecutaron tareas de implementación con los agentes: estas conclusiones evalúan
sus instrucciones y su encaje con el código, no su rendimiento empírico.

| Agente | Evaluación | Uso en el flujo y ajuste necesario |
| --- | --- | --- |
| planner | Buen alcance: inspección previa, contratos, permisos, dependencias y aceptación. Separa planificación de implementación. | Inicia cada feature. El coordinador debe autorizar expresamente que escriba el plan, como exige su rol. |
| dev | Responsabilidad clara sobre la implementación y separación de capas; coordina schemas con DB. | Implementa API y negocio. Exige commits al terminar: asignar una rama de trabajo antes de editar y secuenciar commits en sesiones compartidas. |
| db | Instrucciones sólidas sobre fuente de verdad, integridad, compatibilidad y recuperación. Evita transacciones ficticias y cambios al cliente generado. | Participa cuando cambia persistencia. Acordar si también posee repositorios para evitar solapamiento con dev. Los commits requieren una solicitud expresa. |
| media | Pipeline coherente con AGENTS.md; incluye firma de archivos, límites, metadatos y compensación. | Participa en uploads. Acordar tipos con db/dev y un propietario de rutas; su entrega no especifica rama/SHA, que completa el contrato general. |
| test | Cubre errores y casos negativos, aísla proveedores y no presupone framework. Prohíbe instalar dependencias sin aprobación. | Diseña casos tras los contratos y ejecuta sobre el resultado integrado. Actualmente no existe framework ni script de tests: debe informar esa limitación y proponer una vía concreta. |
| reviewer | Revisión independiente, priorizada por impacto y sustentada en ubicaciones del código. Distingue evidencia de hipótesis. | Revisa plan, diff y validaciones. No corrige; los hallazgos regresan a sus propietarios. La restricción de solo lectura es una instrucción, no un sandbox propio. |
| security | Auditoría enfocada en permisos, JWT, IDOR, uploads, secretos y abuso; sin pruebas destructivas. | Opcional según el cambio, en paralelo con reviewer sobre un diff estable. Evitar repetir hallazgos y mantener la auditoría en solo lectura. |
| architect | Buen enfoque consultivo, incremental y con alternativas; evita reescrituras y abstracciones sin evidencia. | Consultar antes de fijar contratos si hay decisiones estructurales. No usarlo como requisito para cada feature ni autorizar ediciones por defecto. |

## Hallazgos transversales

- Los ocho TOML contienen `name`, `description` y `developer_instructions`, con nombres
  coherentes con sus archivos. La configuración local habilita agentes y limita a cuatro
  hilos de subagentes concurrentes; también se debe respetar el límite efectivo de la sesión.
- El registro mediante `.codex/agents/*.toml` y las claves de configuración coinciden con
  la [documentación oficial de subagentes](https://learn.chatgpt.com/docs/agent-configuration/subagents).
  Los ocho roles están expuestos en esta sesión; eso no demuestra su comportamiento en ejecución.
- No existe un agente documentador ni depurador. El coordinador mantiene los planes y
  cada implementador corrige su parte. No hace falta crear roles adicionales.
- El aislamiento exige sesiones independientes en worktrees distintos según el workflow.
  Los subagentes de una sesión comparten directorio y rama; dividir archivos no basta
  para realizar commits simultáneos sin interferencias.
- `package.json` dispone de `build` y scripts Prisma; no tiene `test` ni `lint`.
  No conviene congelar esa ausencia en el skill: debe volver a inspeccionar los scripts
  al usarlo. Compilar no demuestra que se hayan probado reglas de negocio.
- El backend actual expone `/health`; Prisma contiene el modelo `Example`. Las capas
  descritas en los roles son convenciones para evolucionar el backend, no módulos ya
  implementados. No se debe asumir que existen auth, repositorios o uploads funcionales.
- Las conexiones PostgreSQL y MongoDB interpolan sus URI en mensajes de debug.
  Es un hallazgo del código, ajeno a la configuración de agentes, que merece una tarea
  posterior para evitar exponer credenciales; no se modificó en esta entrega.

## Resultado

Los roles cubren el desarrollo solicitado. El skill incorpora selección por necesidad,
contratos previos, propiedad de archivos, secuenciación de escrituras, revisión independiente
y dos rondas máximas de corrección. Los TOML existentes no requieren cambios para esta entrega.

El skill está en `.agents/skills/modofriki-features/SKILL.md`, ubicación de descubrimiento
por repositorio documentada en [Build skills](https://learn.chatgpt.com/docs/build-skills).
Se invoca, por ejemplo, con:

```text
$modofriki-features Implementa las features de catálogo de cómics y alta de capítulos.
```
