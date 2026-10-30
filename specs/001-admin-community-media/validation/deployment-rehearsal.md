# Ensayo de despliegue

## Ejecutado en entorno desechable

- La suite de migraciones creó una base PostgreSQL temporal, aplicó las seis
  migraciones desde cero y comprobó el historial de Prisma; después eliminó esa
  base temporal.
- Las suites de PostgreSQL y MongoDB verificaron sanciones, decisiones durables,
  catálogo, páginas y referencias multimedia sin usar destinos compartidos.
- Las migraciones de sanciones y banner son aditivas; no eliminan tablas ni
  columnas.

## Pendiente antes de despliegue compartido

No se ensayó un corte con instancias antiguas reales, backup/restauración de un
destino compartido ni rollback operacional. Antes de desplegar se debe detener
writers/lectores antiguos, verificar drift e historial, tomar y probar un backup,
ejecutar la migración en una ventana controlada y volver solo a una versión de
aplicación compatible con las decisiones ya persistidas. No se realizó purga.
