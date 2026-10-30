# Entrega consolidada — T066

Fecha: 2026-10-30. Resultado: cierre backend de fase 7 verificado; **T067 pendiente
del consumidor**. No se habilita QA ni despliegue.

Rama: feature/admin-community-media-phase-7. HEAD base:
`1b134ffdacfe7ec8374be05f30583a4743e6b7c6`. La entrega se registra en el commit final
de esta rama y su PR hacia dev; el SHA final se informa en la entrega del PR para
evitar una referencia circular dentro del propio commit. El cambio contiene
código, regresiones, OpenAPI y evidencia; no se modificaron
main/QA, .env ni secretos. Antecedentes de US1–US4 conservan sus SHA en informes
históricos; este documento no atribuye cambios nuevos a esos commits.

## Requisitos y evidencia

| Requisitos | Implementación / evidencia / límite |
| --- | --- |
| FR-001 | listado/proyección AdminRepository; pruebas administrativas HTTP/SQL y us1.md |
| FR-002 | cambios BASIC/EDITOR con estado conservado y auditoría; us1.md |
| FR-003 | ADMIN protegido y sin promoción pública; matriz de negativos US1 |
| FR-004 | degradación y revocación atómicas; carreras SQL US1 |
| FR-005 | CAS, stale antes de no-op, versiones; suite admin.integration |
| FR-006 | sanción y motivo/evidencia opcional; wiring productivo corregido REV-001 |
| FR-007 | decisiones SQL, staging durable y pendientes rechazados; us2-concurrency.md y suite comment-creation |
| FR-008 | vigencia exacta/restricción única y reloj SQL; comment-sanctions.integration |
| FR-009 | revocación por UUID concreta sin afectar posteriores; sanciones y asignaciones |
| FR-010 | ADMIN no sancionable; capas HTTP y revalidación SQL |
| FR-011 | DTO propio sin actor/evidencia/reporteros y listado ADMIN; pruebas US2 |
| FR-012 | fecha UTC real, falla cerrada, disponibilidad final bajo lock; schemas y carreras TARGET_UNAVAILABLE |
| FR-013 | tres referencias independientes; catálogo y migración banner |
| FR-014 | permisos preflight/asignación y persistencia revalidada; catálogo/US1 |
| FR-015 | readingImages en detalle GET, apertura vigente y pages intacto; catálogo y checker de contrato |
| FR-016 | WORK_OPENING separado y posiciones null, no altera páginas; tests catálogo |
| FR-017 | cierre ordinario opcional sin entidad automática; us4.md y chapter-closing-page |
| FR-018 | publicación completa/exención fija; work-banner-migration y ensayo de recuperación |
| FR-019 | límites/pipeline/CAS/journal; decodificación corregida; Blob real NO probado |
| FR-020 | contrato backend aditivo verificado; repositorio consumidor identificado, aceptación integrada PENDIENTE |
| FR-021 | asignación/revocación/reasignación versionadas/auditadas; pruebas SQL US1 |
| FR-022 | permiso SQL/contenido Mongo, sin transacción distribuida ni cuerpos SQL; carreras/replay/restore |

| Criterio | Resultado backend |
| --- | --- |
| SC-001 | listados/permisos/cursor estables cubiertos; escala de 10 000 cuentas/decisiones con lotes 500 |
| SC-002 | intentos de promover/degradar ADMIN rechazados; no endpoint de borrado administrativo |
| SC-003 | cambio de roles preserva estado/sanciones y downgrade revoca asignaciones; evidencia US1 |
| SC-004 | raíz/respuesta con sanción ganadora quedan ocultas; terminales y retiradas del destino cubiertas en proveedores reales |
| SC-005 | secuencia N/N+1 conserva pages y cierre; integración consumidor aún pendiente |
| SC-006 | exención acreditada y primera publicación completa; migración/restore SQL |
| SC-007 | tres campos y páginas ordinarias cubiertos en backend; adaptador Blob simulado, frontend pendiente |
| SC-008 | carreras SQL y auditoría de relaciones; us1.md |
| SC-009 | motivo/evidencia sin sanción parcial; lookup real de producción conectado, regresión de wiring y contratos |

## Validaciones y revisiones

[final-checks.md](final-checks.md): Prisma validate/generate/build, 30 archivos y
511 unitarias, 11 archivos y 57 integraciones SQL/Mongo, inventarios disjuntos y
guard que rechaza destinos ausentes, checker OpenAPI y whitespace correctos.
Escala: caso 4,203 s en máquina local; no es un SLA.

[deployment-rehearsal.md](deployment-rehearsal.md) y su JSON: PostgreSQL
17.11:62350, MongoDB 8.0.34:62351 en loopback, replica set mf_phase7 y bases
mf_admin_test con UUID. Integración usa mf_admin_test_phase7final. Fallo,
respaldo/restauración, siete migraciones/checksums, drift cero, Example heredado,
exención y rollback compatible comprobados sobre fixtures. Sin seed/reset/db push,
purgas operativas ni conexiones a bases compartidas.

[review.md](review.md) y [security-review.md](security-review.md): revisiones
independientes solo lectura favorables tras resolver REV-001–005/SEC-001–003.
[phase7-fixes.md](phase7-fixes.md) enlaza correcciones y regresiones.

## Pendientes y alcance

- T067: identificar versión efectivamente probada/desplegada del frontend,
  responsable y aceptación explícita de cuatro escenarios; ver
  [frontend-contract.md](frontend-contract.md). Repositorio y despliegue ya
  identificados por el usuario; copia local muestra adaptación pendiente.
- Antes de una ventana compartida: inventario/corte de todos los productores y
  lectores, historia/drift de destino real, backup completo SQL/Mongo/Blob según
  política, restauración coordinada y selección de rollback soportado.
- Blob real no probado, URLs públicas incluso borradores y huérfanos retenidos;
  rate limit por proceso y ausencia de cuotas acumulativas siguen declarados.
- Los marcadores originales T043–T059 permanecen fuera de la actualización de
  fase 7; sus registros agrupados históricos no sustituyen evidencia específica
  de cada archivo de prueba previsto. No se aprueban automáticamente aquí.

Ninguna aprobación de requisitos certifica implementación; ningún mock prueba
proveedor real. Una revisión backend o aprobación QA no sustituye al consumidor.
La aprobación humana de integración se solicita únicamente cuando ese gate esté
completo; no se solicita ahora habilitación de despliegue.
