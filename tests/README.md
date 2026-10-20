# Pruebas de catálogo y multimedia

Desde la raíz, con las dependencias existentes instaladas:

```sh
node --import tsx --test tests/*.test.ts
npm run build
npm run prisma:validate
```

No existe un script npm de test o lint; estos comandos no agregan dependencias. Las pruebas usan `node:test`, servidores HTTP locales, archivos temporales y repositorios/proveedores simulados. `fixtures.ts` reemplaza las variables de conexión antes de importar la aplicación. No conectan a PostgreSQL/MongoDB ni suben o borran objetos reales en Blob.

La suite cubre recepción individual/múltiple y límites Multer, validación de contenido, permisos antes del multipart, PUT sin archivos, orden de páginas, versiones obsoletas, journal antes de subir, compensación, recuperación de reservas y reintentos de limpieza. Los tests de repositorio ejecutan sus métodos sobre dobles de Prisma; no demuestran aislamiento transaccional o constraints contra un PostgreSQL real.

La integración con proveedores requiere una base PostgreSQL aislada con la migración existente aplicada, usuarios/roles/asignaciones y un almacén Blob de pruebas. Queda pendiente verificar ese entorno, incluyendo carreras entre procesos y recuperación tras terminar el servidor durante una subida. No ejecutar estos escenarios contra producción.
