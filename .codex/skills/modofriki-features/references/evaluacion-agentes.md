# Evaluación de agentes locales

Evaluación estática del 19 de octubre de 2026 sobre los ocho TOML de `.codex/agents`,
`AGENTS.md`, la configuración y el backend local. Se inspeccionaron también el workflow
y la plantilla de features al inicio; ambos desaparecieron durante el trabajo.
No se restauraron esos documentos. El skill informa su ausencia y contempla un plan alternativo.
No se ejecutaron features de prueba: las conclusiones evalúan instrucciones, no rendimiento.

| Agente | Evaluación | Uso y precaución |
| --- | --- | --- |
| planner | Buen alcance: inspección, permisos, contratos, dependencias y aceptación; no implementa. | Inicia cada feature. Autorizar expresamente que escriba el plan, como exige su rol. |
| dev | Implementación y separación de capas bien delimitadas; coordina schemas con DB. | API y negocio. Exige commits al finalizar: asignar rama antes de editar y secuenciar commits compartidos. |
| db | Cubre integridad, compatibilidad, fuente de verdad y recuperación. No inventa transacciones distribuidas. | Activar por cambios de persistencia. Acordar propiedad de repositorios con dev; solicitar commits expresamente cuando correspondan. |
| media | Pipeline coherente, con firma de archivos, límites, metadatos y compensación. | Activar para uploads. Acordar tipos con db/dev y propiedad de rutas. Completar su entrega con rama/SHA según el contrato general. |
| test | Aísla proveedores, cubre casos negativos y no presupone framework ni instala dependencias unilateralmente. | Diseña tras los contratos; ejecuta sobre el resultado combinado. Falta infraestructura de tests en el estado actual. |
| reviewer | Revisión priorizada por impacto, ubicaciones y evidencia; distingue errores de hipótesis. | Revisar plan, diff y validaciones. Devuelve hallazgos a los implementadores; no corrige. |
| security | Auditoría enfocada en permisos, JWT, IDOR, uploads, secretos y abuso; sin pruebas destructivas. | Activar según cambios sensibles. Puede revisar junto a reviewer sobre un diff estable; consolidar hallazgos duplicados. |
| architect | Consultivo, incremental, con alternativas; evita reescrituras sin evidencia. | Consultar decisiones estructurales antes de fijar contratos; no convertirlo en requisito para cada feature. |

Los ocho roles cubren el desarrollo solicitado. No existen documentador ni depurador:
el coordinador actualiza los planes y los propietarios corrigen sus módulos.

## Configuración y estado del proyecto

- Los ocho TOML tienen `name`, `description` y `developer_instructions`, con nombres
  únicos que coinciden con sus archivos. Los ocho roles están expuestos en esta sesión.
- `.codex/config.toml` habilita agentes y limita a cuatro hilos de subagentes concurrentes;
  también rige el límite efectivo de la sesión. El formato coincide con la
  [documentación oficial](https://learn.chatgpt.com/docs/agent-configuration/subagents).
- Las instrucciones de solo lectura de reviewer/security no constituyen un sandbox separado:
  heredan los permisos de la sesión, como explica esa documentación.
- Los agentes de una sesión comparten directorio y rama. Para trabajo aislado en paralelo,
  usar sesiones independientes con worktrees distintos; secuenciar escrituras y commits
  cuando compartan sesión. Los TOML existentes no se modificaron.
- `package.json` tiene build y scripts Prisma, pero no scripts de test/lint ni framework
  de tests declarado. Compilar no prueba reglas de negocio; volver a inspeccionar al usar el skill.
- Actualmente existen `/health` y el modelo Prisma `Example`. No asumir que ya hay auth,
  repositorios, modelos de dominio o uploads funcionales porque los roles los mencionen.
- El skill se guarda en `.agents/skills`, ubicación de descubrimiento por repositorio
  documentada en [Build skills](https://learn.chatgpt.com/docs/build-skills).

## Validación

Se analizaron los ocho TOML con `tomllib` y se verificaron sus campos obligatorios,
nombres únicos y configuración local. No se evaluó el rendimiento de los subagentes.
El validador Python de skill-creator no pudo arrancar por ausencia de PyYAML;
se utilizó el parser YAML ya instalado en el proyecto para comprobar el frontmatter,
nombre, descripción, cuerpo y presencia de los ocho roles, sin instalar dependencias.
