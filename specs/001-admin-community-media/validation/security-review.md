# Auditoría de seguridad — T064

Fecha: 2026-10-30. Auditor independiente `phase7_security`, solo lectura.
HEAD inicial `1b134ffdacfe7ec8374be05f30583a4743e6b7c6` y reauditoría del diff.
No modificó archivos, checklists ni Git; no accedió a proveedores reales.
Checklist revisada: [security.md](../checklists/security.md), marcadores intactos.

**Conclusión de reauditoría: SEC-001–003 cerrables, sin nuevos bloqueos de
seguridad en las correcciones.** El auditor inspeccionó causas y regresiones;
los resultados 511 unitarias/57 integración los ejecutó el coordinador.

| Hallazgo inicial (media) | Corrección revalidada |
| --- | --- |
| SEC-001: evidencia válida siempre 503 por singleton desconectado | Adaptadores de CommentRepository/CommentReportRepository en producción; cinco casos HTTP de wiring conservan servicio real y no persisten evidencia inválida |
| SEC-002: Joi normalizaba fechas imposibles/sin zona | UTC canónico con milisegundos y roundtrip antes de Date; null conservado; rechaza fecha sola, sin zona, 30 febrero y offset no admitido |
| SEC-003: WebP con solo encabezado aceptado | Sharp ya instalado decodifica antes de Blob; 40 M píxeles, salida mínima, archivos secuenciales, failOn warning; PNG/JPEG/WebP válidos y corrupto cubiertos |

La incorporación de decodificación ajusta la decisión anterior de comprobar solo
estructura sin Sharp: ya existe esta dependencia para miniaturas; no se añadió
paquete. Los límites de bytes/píxeles se preservan y el resultado raster de
validación es mínimo. No se modificó la política de conservación de Blob.

## Trazabilidad de los 40 criterios

Revisado significa evidencia estática, no certificación personal de proveedores.

| CHK | Evidencia revisada y alcance |
| --- | --- |
| CHK001 | auth.service, admin/sanction repositories: identidad vigente, ADMIN activo y revalidación SQL |
| CHK002 | admin.schema y repositorios: BASIC/EDITOR; protección ADMIN y registro BASIC |
| CHK003 | admin.repository: conserva estado/sanciones y revoca asignaciones atómicamente |
| CHK004 | schemas UUID/cursores/CAS/campos estrictos; SEC-002 corregido |
| CHK005 | relaciones usuario/obra/evidencia verificadas por repositorios; SEC-001 corregido |
| CHK006 | catalog preflight antes de Multer y revalidación al persistir |
| CHK007 | motivo trim 1–2000 y autor de evidencia; wiring corregido |
| CHK008 | reloj SQL tras locks, expiración exacta y permanente null; fecha corregida |
| CHK009 | estado cuenta, rol y sanción separados |
| CHK010 | COMMITTED define aceptación; imposición rechaza PREPARED bajo lock compartido |
| CHK011 | límites de receiver, estructura/MIME/píxeles y decodificación corregida |
| CHK012 | tres activos independientes y exención histórica interna |
| CHK013 | journal SQL sin cuerpo, Mongo contenido y Blob bytes |
| CHK014 | FK RESTRICT/CHECK/único parcial y auditoría atómica en migraciones/repositorios |
| CHK015 | vigencia se evalúa al consultar/crear, sin cron |
| CHK016 | locks/CAS y stale antes de no-op administrativo |
| CHK017 | readingImages distingue apertura, conserva pages, sin cierre especial |
| CHK018 | sanción rechaza pendientes; COMMITTED previo se conserva |
| CHK019 | staging primary/majority; recuperaciones y ensayo T062 del coordinador |
| CHK020 | autoridad no disponible falla cerrada; errores seguros |
| CHK021 | id/listas/hilos/padres/edición/borrado/votos/reportes/evidencia usan accesibilidad |
| CHK022 | solo ausencia estricta es legacy; null/discrepancia ocultos; corte operacional obligatorio |
| CHK023 | reconciliador máximo 100 de un autor, solo rechazo de expiradas, sin purga |
| CHK024 | UUID/autor/huella; replay COMMITTED corregido y solicitudes distintas 409 |
| CHK025 | revocación por UUID y asignación versionada; no toca relaciones posteriores |
| CHK026 | orden User→Work, CAS y revalidación; carreras reales atribuidas a suites del coordinador |
| CHK027 | stageReply toca padre ACTIVE en transacción; replay aceptado preserva tombstone |
| CHK028 | limit+1, cursor último examinado, páginas vacías con continuación |
| CHK029 | DTO público/admin/propio distintos; sin hashes ni reporteros fuera de moderación |
| CHK030 | logger HTTP sin query/body/token y errores normalizados; handler global no debe recibir driver crudo |
| CHK031 | conserva referencia/historial; borrado lógico retira cuerpo sin copia de evidencia |
| CHK032 | sanción 403, sin revocar sesión |
| CHK033 | Blob público y archivos retenidos expresamente declarados |
| CHK034 | migraciones aditivas; recuperación real de fixtures en T062, sin certificar hosting |
| CHK035 | corte exclusivo y rollback solo compatible; supervisor de ensayo y runbook |
| CHK036 | consumidor identificado, aceptación y versión desplegada pendientes |
| CHK037 | rate limit por IP/proceso; no cuota acumulativa o store compartido |
| CHK038 | regresiones nuevas para SEC-001–003 y relectura independiente |
| CHK039 | separación explícita mocks/probes/proveedores; Blob real no ejecutado |
| CHK040 | FR/SC/tareas/evidencia enlazados en delivery y gate QA |

## Riesgos residuales

Blob público incluye borradores y archivos retenidos; el guard del catálogo no
hace privada una URL. Rate limiting en memoria no se comparte entre instancias;
no existen cuotas acumulativas de decisiones/provisionales/archivos. Estos límites
no equivalen a una purga autorizada.

El handler global registra mensaje/stack de errores no normalizados; no se
reprodujo fuga en esta feature. Los repositorios normalizan errores externos.
El auditor observó JWT HS256, expiración máxima de siete días y relectura SQL,
sin inspeccionar valores de secretos.

Exclusión real de lectores/writers antiguos y aceptación del consumidor siguen
siendo condiciones del despliegue. El auditor no certifica personalmente T062 ni
Vercel Blob; ver evidencia del coordinador y límites del ensayo.
