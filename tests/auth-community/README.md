# Pruebas de Auth y Community API

Runner existente de Node.js (`node:test`) con `tsx`, sin nuevas dependencias ni scripts npm. Desde la raíz:

```powershell
node --import tsx --test tests/auth-community/*.test.ts
```

`setup.ts` fija variables de prueba antes de importar aplicación/servicios: PostgreSQL y MongoDB en loopback puerto 1, JWT de prueba, bcrypt de coste 4. No se ejecuta `src/index.ts`, no se abren conexiones a bases de datos ni se utilizan secretos del entorno de aplicación. Los mensajes estáticos ERROR producidos por los casos negativos son esperados.

Para ejecutar ambas suites y comprobar tipos estrictos en PowerShell:

```powershell
$env:NODE_ENV = 'test'
$env:DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test'
$env:MONGODB_URI = 'mongodb://127.0.0.1:1/test'
$env:JWT_SECRET = 'isolated-test-secret-with-at-least-32-characters'
$env:BCRYPT_SALT_ROUNDS = '4'
$env:LOG_LEVEL = 'error'
node --import tsx --test tests/community/*.test.ts tests/auth-community/*.test.ts
$testSources = @(rg --files tests/auth-community tests/community -g '*.ts')
node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --target ES2022 --module NodeNext --esModuleInterop --skipLibCheck --types node $testSources
```

| Área | Casos |
| --- | --- |
| Auth Service | Hash bcrypt verificable sin alterar password, DTO sin hash, BASIC, JWT HS256 de siete días, campos prohibidos, longitud/bytes de password, email/username/timezone inválidos, credenciales uniformes, cuentas inactivas/eliminadas, conflicto de unicidad. |
| JWT | Firma/algoritmo/expiración inválidos, falta de iat/exp, emisión futura, duración excesiva, rol inválido, usuario ausente y rol vigente en DB. |
| Community Service | Destino publicado WORK/CHAPTER, autor del servidor, Markdown intacto, respuestas anidadas con destino heredado, tombstones, selectores exclusivos, cursor y límites, autor público en lote, edición propia con revisión, borrado propio/ADMIN y denegación EDITOR, votos ±1, reportes restringidos y moderación ADMIN. |
| HTTP | Routers, controllers y middlewares reales con Services/repos dobles: registro/login/me, lectura pública/Bearer opcional inválido, mutaciones protegidas, extracción body/query/params, envelopes 200/201/204, identidad forjada en req.user rechazada por role guard, JWT ADMIN degradado y BASIC elevado mediante rol vigente. Todos los endpoints actuales tienen al menos un caso de éxito. |
| Regresión app | Health, documentación, CORS permitido, 404 JSON, JSON malformado 400 y payload excesivo 413, importando app real sin arrancar conexiones. |
| Repositories SQL | Normalización de claves, display preservado, BASIC/ACTIVE fijo, conflicto P2002, usuarios vigentes, proyección pública sin email/hash, IDs deduplicados, destino publicado y capítulo de obra publicada. |
| Logging | Sólo mensaje estático/status; error original con secretos nunca se entrega al logger. |
| Transacciones | Error MongoServerError original y su etiqueta llegan intactos al callback de withTransaction; doble de sesión puede reintentar. Fallo final sanitizado fuera del callback y sesión cerrada. |

Los repositorios de negocio son fakes de contrato, sin motor de almacenamiento. Las pruebas HTTP sí abren un servidor Express local en un puerto efímero, y lo cierran incluso ante fallos. `transaction.test.ts` usa un error del driver real y una sesión falsa: comprueba preservación de identidad y límites de sanitización, sin demostrar reintentos, aislamiento o rollback de MongoDB real.

No se mide porcentaje de cobertura. No hay pruebas de PostgreSQL real (unicidad/concurrencia/constraints) ni MongoDB replica set (índices/transacciones/concurrencia); requieren servicios de prueba aislados, migraciones aplicadas e índices creados. No se ejecutan migraciones ni limpiezas. Multer/Blob no intervienen en estas features y no se suben archivos.
