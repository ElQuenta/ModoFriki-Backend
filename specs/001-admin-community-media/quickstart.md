# Quickstart de validación

Guía de validación de la implementación actual. Contratos: [HTTP](contracts/http-api.md), [persistencia](contracts/persistence.md), [modelo](data-model.md). La aceptación del consumidor sigue siendo una dependencia externa registrada en `validation/frontend-contract.md`.

## Prerrequisitos y aislamiento

- Checkout de rama feature revisada; Node compatible con runtime actual y dependencias de package-lock.json. Reutilizar instalación existente; npm ci solo si se necesita preparar un checkout limpio y no descartar trabajo ajeno.
- PostgreSQL desechable y MongoDB replica set desechable, nunca producción/base compartida. No leer/imprimir secretos ni editar .env. Credenciales inyectadas por sesión/CI y destinos identificados antes de habilitar pruebas.
- Para Blob real, almacén/token exclusivamente de pruebas autorizado. Pruebas unitarias inyectan adaptador y no necesitan subir archivos.
- vitest.integration.config.ts separado, con env de integración explícitas, validación de destinos de test y sin las URLs ficticias forzadas por vitest.config.ts. No fallback a DATABASE_URL/MONGODB_URI de desarrollo. Fixtures propios con UUID/namespaces por ejecución; no borrado masivo fuera del namespace de prueba.
- En implementación, vitest.config.ts excluye `**/*.integration.test.ts` sin perder exclusiones predeterminadas ni valores ficticios; vitest.integration.config.ts incluye solo `src/**/__tests__/**/*.integration.test.ts`. Comprobar inventarios disjuntos antes de ejecutar proveedores. Los helpers reales solo se importan desde archivos de integración; npm test debe funcionar sin variables TEST_* ni conexiones a proveedores reales.

## Checks disponibles en el proyecto

Desde raíz del repositorio, después de implementar:

```powershell
npm run prisma:validate
npm run prisma:generate
npm run build
npm test
```

Generar no aplica migraciones. No existe npm run lint. No usar prisma:migrate (migrate dev) sobre base compartida, migrate reset, db push ni seed existente para fabricar fixtures: seed aprovisiona ADMIN y no es setup de tests.

Aplicar migración revisada solo en destino desechable verificado con el procedimiento de despliegue aprobado. Antes del despliegue compartido comprobar historial/drift, backup/restauración y reconciliación del baseline: README y carpeta de migraciones local no coinciden en el baseline citado. No marcar aplicada una migración ausente para ocultar esa diferencia.

Con destinos explícitos preparados, ejecutar integración:

```powershell
npx vitest run --config vitest.integration.config.ts
```

El binario Vitest ya está instalado; no instalar versión nueva. La config debe fallar con mensaje claro si no se han suministrado destinos identificados, en vez de omitir silenciosamente las pruebas y anunciar éxito. NODE_ENV=test; no imprimir URIs/tokens. En CI los secretos se inyectan por variables dedicadas TEST_DATABASE_URL y TEST_MONGODB_URI, mapeadas por la config antes de importar clientes.

## Escenarios reproducibles

1. **Roles**: fixtures ADMIN, BASIC ACTIVE, EDITOR ACTIVE, BASIC SUSPENDED, EDITOR SUSPENDED y eliminado. Obtener listado/admin detail; cambiar ambos sentidos con expectedUpdatedAt. Verificar mismo status, sanciones conservadas, JWT anterior usa rol vigente, otro ADMIN y propio intocables, eliminados 404. Actor no ADMIN no obtiene listado ni cambia nada.
2. **Asignaciones**: asignar con expectedVersion=0, consultar versión/createdAt estable, revocar con versión recibida y reasignar explícitamente. Revocación con versión vieja debe ser 409, sin retirar la reasignación. Degradación con dos obras produce un ROLE_CHANGED y dos EDITOR_REVOKED atómicos; inyectar fallo antes de commit y verificar rollback total.
3. **Sanciones**: imponer temporal con motivo y endsAt futuro, comprobar vista propia sin evidencia/reporteros y 403 estable para raíz/respuesta. Probar fin exacto con reloj SQL controlado por fixtures/duración y barrera, sin sleeps frágiles; permanente no caduca. Revocar por UUID, repetir sin evento nuevo y comprobar no afecta una nueva sanción. ADMIN destinatario rechazado. Evidencia omitida válida; ajena/inexistente rechazada sin sanción parcial.
4. **Carrera estricta**: detener stage Mongo de raíz y respuesta con barrera del repositorio de prueba; confirmar sanción SQL, dejar completar write tarde y finalizar. Esperado: REJECTED y contenido invisible en listas/id/thread y no usable como padre/voto/reporte/evidencia/edit/delete. Repetir con decision COMMITTED ganando antes: comentario permanece guardado, sanción no lo borra.
5. **Fallos**: matar coordinador tras prepare y tras stage; simular timeout Mongo y resultado incierto del commit SQL. Recuperar por mismo Idempotency-Key y no duplicar. Reconciliación --apply solo rechaza PREPARED vencidas; ni fin/revocación reactivan REJECTED. Caída SQL nunca permite provisional. Verificar páginas vacías con hasMore y cursor que avanza sin saltar candidato visible.
6. **Imágenes**: crear DRAFT con cover, banner e inpagecover; obtener tres referencias. Publicar sin cada una falla antes Blob y en repository; completar usando referencia previa funciona. Fixture publicada antes de corte sin banner permanece editable/legible y publica capítulos; DRAFT antigua nunca publicada exige tres. Despublicar/republicar la histórica conserva exención.
7. **Lectura**: capítulo N páginas devuelve N+1 con apertura o N sin ella (legacy), pages idéntico con posiciones; dos páginas con URL repetida siguen siendo dos. Cierre subido como última página se conserva sin automatismo. Consultar no altera version/lecturas/visitas/progreso. Consumidor nuevo no concatena apertura otra vez.
8. **Pipeline y recuperación**: sin permiso no llegar a recepción/Blob; MIME discordante/contenido inválido/límites fallan. Rol/asignación perdido durante subida bloquea commit. Fallo persistencia conserva Blob/journal según política. Borrado de generación vieja posterior al commit respeta nueva inversa workBanners; fallo del proveedor no revierte la nueva generación ni programa reintentos.
9. **Integridad del staging**: UUID duplicado tras timeout solo permite finalizar tras lectura primary/majority y coincidencia de autor/marcador/contenido canónico. null o marcador diferente de _id nunca se acepta como legacy; caída SQL produce 503. Borrar padre antes de stageReply impide respuesta; borrarlo después del staging conserva tombstone e hilo. Reintento del staging ya durable no repite efectos sobre revision del padre.
10. **Disponibilidad final del destino**: pausar tras staging, despublicar o dar de baja WORK, CHAPTER o su obra padre y continuar finalize. Esperado: REJECTED/TARGET_UNAVAILABLE persistido, 404 y ningún comentario público. Invertir el orden: si COMMITTED ganó antes, retirar catálogo aplica su visibilidad sin reescribir la decisión. Probar ambos órdenes con locks User→Work, sin llamada Mongo dentro de SQL ni excepción que revierta el rechazo.
11. **Estados y fechas explícitos**: insertar en SQL desechable todas las combinaciones válidas e inválidas de las tablas de data-model.md, incluidos NULL parciales, decidedAt anterior a preparedAt, COMMITTED fuera del plazo, REJECTED sin código permitido y cierre de sanción incoherente. Las operaciones bajo lock verifican el reloj; los CHECK no dependen de now().
12. **Confirmación detrás del cursor**: examinar/omitir un provisional, continuar el recorrido y después aceptarlo. No se promete que aparezca detrás del cursor ya pasado. Reiniciar la consulta sin cursor, sustituir la colección local y comprobar que aparece según visibilidad y orden. Mantener páginas vacías con hasMore=true, avance acotado y sin añadir polling obligatorio.

## Aceptación del consumidor antes del despliegue

Completar validation/frontend-contract.md con repositorio, versión o SHA, responsable, fecha, entorno y evidencia real de cuatro escenarios: página vacía con hasMore=true; refresco desde primera página para confirmación tardía; readingImages sin duplicar apertura; progreso por posiciones editoriales conservado. Registrar aceptación explícita del responsable del consumidor. El contrato escrito y la aprobación de QA no sustituyen esta evidencia. Si falta acceso/respuesta externa, mantener gate de despliegue pendiente; las pruebas del backend pueden avanzar. No enviar mensajes externos sin autorización ni afirmar haber cambiado otro repo.

## Criterio de salida y evidencia

Registrar comandos, resultados reales y destinos de test identificados sin secretos. Pasar build, suites existentes, nuevas unitarias/HTTP y pruebas reales de SQL/Mongo/carreras; Blob real solo declarar probado si se ejecutó. Auditar DTO/logs, OpenAPI/API y consumidor. Revisión independiente y de seguridad antes de proponer QA; aprobación humana antes de integrar a QA.

La rama de la fase 7 valida documentación, migraciones y pruebas en proveedores desechables. No se aplicaron migraciones ni se realizó despliegue sobre una base compartida; la aceptación explícita del consumidor sigue siendo necesaria antes de proponer integración a QA.

## Cierre de fase 7 (2026-10-30)

T060–T066 completadas; T067 permanece pendiente. El consumidor identificado es
`ElQuenta/ModoFriki-Web`, con despliegue comunicado en
https://modo-friki-web.vercel.app/. Registrar versión efectivamente probada,
responsable, resultados y aceptación en `validation/frontend-contract.md`.

Checks adicionales reproducibles desde la raíz:

```text
node test-support/check-test-isolation.mjs
node test-support/check-api-contract.mjs
node test-support/deployment-rehearsal.mjs <runtime.json> <rollback/dist/index.js>
```

El último comando requiere instancias nuevas propias de PostgreSQL/Mongo replica
set, binarios pg_dump/pg_restore, build candidato y artefacto compatible previo;
no aprovisiona ni descubre destinos de aplicación. Ver
`validation/deployment-rehearsal.md` para formato de runtime, evidencia y límites.
Nunca reutilizar una base compartida ni .env como destino implícito.

La validación actual pasa 511 unitarias y 57 integraciones, además de Prisma,
build, inventarios disjuntos y contrato. Se corrigieron wiring de evidencia,
fechas, replay COMMITTED, errores Mongo, decodificación de imágenes y OpenAPI.
Solo detalle GET devuelve readingImages. Los borradores incompletos siguen
permitidos; publicar sin exención exige las tres referencias. Sin Blob de test
autorizado, no se declara ese proveedor real validado.
