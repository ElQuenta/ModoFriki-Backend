# Ensayo de despliegue

## Ejecutado en entorno desechable

- La suite de migraciones creó una base PostgreSQL temporal, aplicó las seis
  migraciones desde cero y comprobó el historial de Prisma; después eliminó esa
  base temporal.
- Las suites de PostgreSQL y MongoDB verificaron sanciones, decisiones durables,
  catálogo, páginas y referencias multimedia sin usar destinos compartidos.
- Las migraciones de sanciones y banner son aditivas; no eliminan tablas ni
  columnas.
- `work-banner-migration.int.test.ts` recrea el corte sobre una base temporal:
  aplica las migraciones anteriores, inserta una obra publicada, un borrador
  antes publicado y un borrador nunca publicado, y aplica la migración de
  banner. Solo las dos primeras quedan exentas. Una consulta con las columnas
  que conocía el lector anterior continúa funcionando después del corte.

## Pendiente antes de despliegue compartido

No se ensayó backup/restauración de un destino compartido ni rollback operacional
de una instancia antigua real. Antes de desplegar se debe detener
writers/lectores antiguos, verificar drift e historial, tomar y probar un backup,
ejecutar la migración en una ventana controlada y volver solo a una versión de
aplicación compatible con las decisiones ya persistidas. No se realizó purga.
