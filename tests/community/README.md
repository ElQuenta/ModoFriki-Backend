# Pruebas de persistencia de comunidad

Desde la raíz, con las dependencias existentes instaladas:

```powershell
node --import tsx --test tests/community/*.test.ts
```

Comprobación estricta de tipos de los tests con TypeScript 7, sin cambiar el `tsconfig.json` de la aplicación:

```powershell
node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --target ES2022 --module NodeNext --esModuleInterop --skipLibCheck --types node tests/community/fakes.ts tests/community/models.test.ts tests/community/repositories.test.ts
```

Se usa el runner integrado `node:test` y `tsx` existente. No hay script npm de test, nuevas dependencias ni servicios requeridos. Las importaciones probadas no leen `.env`, no conectan a bases de datos ni suben archivos a Blob.

| Área | Casos |
| --- | --- |
| Documentos Mongoose | UUID canónicos, Markdown intacto, cuerpo/revisión/estados, límites, raíz propia, respuestas válidas y rechazo a autorreferencias, identidad inmutable, campos desconocidos y arrays de respuestas rechazados. |
| Consultas | Ámbito de obra/capítulo/padre/raíz, límite 1–100, búsqueda de una fila adicional, cursor ascendente `(createdAt, _id)`, empate temporal, fin y página vacía. |
| Escrituras de comentarios | UUID generado, derivación del destino y raíz desde el padre, edición condicionada a autor/estado/revisión, borrado lógico con eliminación del cuerpo y conservación de enlaces. |
| Votos | Valores ±1, upsert por comentario/usuario, retirada idempotente sin requerir comentario activo, agregado por lote acotado, deduplicación y ceros para comentarios sin votos. |
| Reportes | Motivo/detalle válidos, rechazo sobre comentario inactivo, estado inicial abierto, listado acotado de moderación, resolución con actor y rechazo de sobrescritura de reportes cerrados. |
| Contrato transaccional | Sesión compartida y escritura condicional `ACTIVE`/incremento de revisión antes de respuesta/voto/reporte; cierre en éxito/error; sin fallback al fallar sesión. |
| Errores | Validación 400, no encontrado 404, revisión/duplicado 409 y error de persistencia 500 sin datos del driver. |
| Índices | Declaración de índices de recorrido y de interacción únicos; no demuestra su creación ni unicidad en una base real. |

`ModelDouble` registra llamadas y devuelve respuestas programadas: no evalúa filtros ni implementa un motor Mongo. La sesión simulada comprueba el ciclo y la propagación de errores; no demuestra aislamiento, rollback ni concurrencia reales.

La integración requiere un replica set MongoDB de prueba dedicado, índices creados y credenciales exclusivas. Debe verificar votos/reportes concurrentes, eliminación frente a interacciones, rollback e índices efectivos. No se ejecutó integración porque no hay ese servicio disponible; tampoco se leyó una URI del entorno de la aplicación ni se creó una prueba omitida que sugiera cobertura inexistente. La limpieza de una futura suite deberá limitarse a los UUID que esa ejecución haya creado, sin borrados generales.

Services, Controllers, autorización HTTP y pipeline Multer/Blob quedan fuera de esta entrega y aún no están implementados para el dominio. El método de repositorio para moderación requiere que el futuro Service verifique ADMIN. Las comprobaciones de existencia/visibilidad en PostgreSQL tampoco están cubiertas por estos tests.

No se mide un porcentaje de cobertura. La validación Prisma, generación del cliente, compilación y revisión SQL se registran en el plan de la entrega; estos tests no verifican restricciones SQL mediante expresiones regulares ni aplican migraciones.
