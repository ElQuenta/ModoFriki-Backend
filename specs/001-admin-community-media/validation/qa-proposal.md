# Preparación revisable para QA — T067

**Estado: PENDIENTE. No habilitar integración ni despliegue.**
Actualizado: 2026-10-30. Alcance preparado: backend y plan de corte/recuperación.

| Gate | Evidencia / estado |
| --- | --- |
| T060 | API/OpenAPI/Prisma/quickstart sincronizados |
| T061 | final-checks.md: 511 unitarias, 57 integraciones y checks obligatorios PASS |
| T062 | deployment-rehearsal.md y JSON PASS de fixtures con restore/rollback compatible |
| T063 | review.md: REV-001–005 resueltos, revisión favorable |
| T064 | security-review.md: SEC-001–003 revalidados, sin nuevos bloqueos |
| T065 | phase7-fixes.md: correcciones y regresiones ejecutadas |
| T066 | delivery.md: trazabilidad FR-001–022 / SC-001–009 y límites |
| Consumidor | Repositorio y URL identificados; versión desplegada/probada, cuatro escenarios y aceptación explícita PENDIENTES |
| Aprobación humana QA | No solicitada; depende del gate de consumidor completo |

Consumidor: https://github.com/ElQuenta/ModoFriki-Web
Despliegue comunicado: https://modo-friki-web.vercel.app/
La referencia local dev observada no acredita la versión desplegada ni su
compatibilidad. Ver frontend-contract.md para evidencia faltante y desajustes.

## Secuencia propuesta para revisión futura

1. Completar validación/aceptación del frontend: página vacía con continuación,
   refresco por confirmación tardía, apertura única y progreso editorial intacto.
2. Responsable de destino verifica historia/drift, publicaciones históricas y
   capacidad de restauración completa; identifica artefacto candidato y rollback
   soportado por SHA/hash. No inferir base compartida a partir del fixture local.
3. Cerrar tráfico; detener/drenar TODOS los readers/writers/jobs/scripts antiguos,
   respaldar coordinadamente y aplicar únicamente migraciones revisadas. Una
   discrepancia de baseline o migración fallida detiene el procedimiento.
4. Arrancar exclusivamente la versión compatible, comprobar salud, permisos,
   publicaciones/decisiones, lectura y consumidor antes de abrir tráfico.
5. Ante fallo, mantener cerrado el tráfico, conservar historial y backups y
   recuperar hacia artefacto compatible o restauración coordinada con ventana
   acordada. No volver a lectores anteriores al protocolo ni borrar esquema,
   eventos, provisionales o Blob para simular recuperación.

El ensayo local conserva sus límites: comments/índices Mongo de fixtures, sin
bytes Blob ni certificación de hosting/corte externo. No es autorización para
usar esos comandos sobre infraestructura compartida.

Cuando los gates estén completos, presentar diff y esta evidencia para aprobación
humana expresa de integración a QA. No se ejecutó merge, despliegue ni push forzado.
