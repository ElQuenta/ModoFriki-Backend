# Feature: Auth

## Objetivo

Exponer registro, login e identidad vigente sobre los modelos reales recibidos de `dev`, respetando roles BASIC, EDITOR y ADMIN.

## Estado actual

Base revisada: `origin/dev` f93c4c8, adelantada por fast-forward en `feature/auth-community`. El draft de la base anterior se conserva aparte y no se aplica. Se inspeccionaron AGENTS, skill modofriki-features, WORKFLOW, TEMPLATE, package.json, tsconfig, prisma.config.ts, schema, conexiones, env, app/index, middlewares, handlers y logger.

User ya existe con email/emailNormalized, username/usernameNormalized, passwordHash, role BASIC/EDITOR/ADMIN, status ACTIVE/SUSPENDED/DELETED, timezone, timestamps y deletedAt. Work/Chapter y demás dominio SQL ya están modelados. Reutilizar Prisma y sus migraciones; no recrear tablas ni importar el schema mínimo descartado. El middleware JWT previo no valida estado del usuario contra DB y sus roles deben adaptarse.

TypeScript estricto. bcryptjs, jsonwebtoken, Joi y Winston ya instalados. Scripts: build, dev, start, prestart, prisma:generate/validate/migrate/studio. No scripts test/lint; no inventarlos.

## Alcance

POST register/login y GET me; hash bcrypt configurado, JWT HS256 siete días, usuario ACTIVE comprobado desde DB por petición protegida. Registro siempre BASIC/ACTIVE; sin asignación pública EDITOR/ADMIN. Sin refresh, recuperación de password, edición perfil, uploads ni migración del dominio existente.

El usuario implementará los esquemas de validación: no crear Joi schemas ni modificar validate.middleware. Mantener comprobaciones mínimas de invariantes y seguridad en Service y utilidades existentes.

## API

| Método | Ruta | Autenticación | Entrada | Salida |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | Pública | `{ username, email, password, timezone? }` | 201 AuthResult |
| POST | `/api/auth/login` | Pública | `{ email, password }` | 200 AuthResult |
| GET | `/api/auth/me` | Bearer de usuario ACTIVE | — | 200 User |

AuthResult `{ user, token }`. User autenticado: `{id,username,email,role,timezone,createdAt}`, con UUID y fecha ISO. Nunca hash, campos normalizados internos o metadatos de persistencia. `docs/API.md` y OpenAPI reflejan los roles y DTO implementados.

Email/username: conservar presentación y calcular trim/lowercase para claves normalizadas, con índices únicos existentes. Password mínimo 8 caracteres y máximo 72 bytes UTF-8 sin transformar. Timezone válida IANA o default existente America/La_Paz. Ignorar/rechazar entradas privilegiadas sin permitir sobreescritura de role/status/hash/id. Credenciales inválidas: 401 uniforme sin enumerar emails; duplicados: 409 incluso ante carrera; input inválido: 400; errores internos: 500 seguro. Suspensión/borrado impide login y autenticación (código uniforme acordado en implementación).

## Pipeline de middlewares

Global actual: HTTP logger → CORS → JSON → rutas → 404 → handler final. Register/login: Controller → Service → Repository. Me: authenticate → Controller → Service → Repository. Sin nuevos validadores Joi.

authenticate verifica HS256, iat/exp y máximo siete días; consulta User y requiere ACTIVE/deletedAt null. req.user conserva id/role vigente desde DB, sin confiar en privilegios del token. authorize admite BASIC/EDITOR/ADMIN y devuelve 403 por rol insuficiente. Sin consultas directas desde controller ni rutas, ni Request/Response en negocio/repositorios.

## Persistencia

PostgreSQL User es fuente autoritativa; reutilizar cliente/adapter/config existentes. MongoDB no almacena credenciales ni autoridad de usuarios. Blob no interviene. No cambios de schema ni migraciones previstos. Generar cliente mediante script existente si hace falta, sin editarlo manualmente. No reset/DROP, cambios .env ni aplicación automática de migraciones. Recuperación: revertir aplicación; el dominio existente permanece.

## Contratos compartidos

AuthRepository: findByEmail, findById, create y findByIds. create recibe email/username de presentación, hash y timezone; el repositorio deriva las claves normalizadas y fija BASIC/ACTIVE. findByIds selecciona sólo id/username/status/deletedAt para autores públicos. Usuario activo requiere status ACTIVE y deletedAt null. Role/AuthUser Express usa BASIC/EDITOR/ADMIN.

Logger por módulo en Controller/Service/Repository/middlewares funcionales. Cada operación protegida por try/catch y catchAndLogError existente; propagación al handler final sin respuestas duplicadas. No loguear body, passwords/hash, tokens, Authorization ni URIs. Excepciones de proveedores deben sanitizarse antes de logging. Routes sólo composición.

## Tareas

### AUTH-01
Responsable: db. Objetivo: repositorio Auth sobre schema existente.
Archivos propios: `src/repositories/auth/auth.repository.ts`, tipos compartidos asignados por coordinador. Sin modificar Prisma salvo defecto demostrado/coordinado.
Dependencias: DTO y política ACTIVE acordados.
Contrato: búsqueda normalizada, creación BASIC/ACTIVE, consulta de vigencia y proyección pública batch.
Validaciones: prisma:validate, generación si hace falta, build; unicidad y proyección.
Criterios: no duplicación de User, índices existentes usados, P2002 mapeado a409, hash sólo interno.

### AUTH-02
Responsable: dev/coordinador. Objetivo: API, hash/JWT y middleware vigente.
Archivos propios: `src/services/auth/`, `src/controllers/auth/`, `src/routes/auth.routes.ts`, auth.middleware, role.middleware, types/express.d.ts, app.ts, docs/API.md y openapi.yaml (único propietario de compartidos).
Dependencias: AUTH-01; sin schemas Joi ni cambios validate.middleware.
Contrato: tres endpoints y pipeline anteriores; actualiza contrato API con roles reales antes de código.
Validaciones: build; casos HTTP y seguridad del plan.
Criterios: registro BASIC, token siete días, rol/status vigentes por petición, DTO sin secretos, logger/catchAndLogError por capa.

### AUTH-03
Responsable: test; reviewer/security sólo lectura. Objetivo: verificar contrato y amenazas.
Archivos propios: harness acordado fuera de implementación; no cambiar código ajeno.
Dependencias: AUTH-01/02 combinadas.
Contrato: requests y dobles explícitamente identificados o DB aislada disponible.
Validaciones: suite funcional, permisos y fallos de persistencia, build/Prisma.
Criterios: informar fallos iniciales/finales reales; no confundir dobles con integración DB.

## Plan de pruebas

Registro/hash; normalización e índices únicos con carreras si DB disponible; login válido/inválido; password corto/UTF8 mayor72bytes; no elevar rol/status desde body; JWT algoritmo/firma/exp/iat inválidos y duración excesiva; me sin token; usuario ACTIVE, SUSPENDED, DELETED y deletedAt; degradación de ADMIN después de emitir token; role guard EDITOR/BASIC; timezone válida/inválida; respuestas/logs sin secretos; regresión health/404/CORS.

## Riesgos

Auth y Community actualizan el contrato anterior; sus consumidores requieren adaptación. No depender del stash antiguo. Sin DB aislada no declarar probadas carreras/índices reales. Login/registro sin rate limiter queda riesgo pendiente confirmado por security; limitar intentos en infraestructura o API. Lectura ACTIVE por petición agrega acceso SQL intencional para permisos vigentes.

## Integración

Rama feature/auth-community desde dev actualizado f93c4c8. Directorio compartido, un dueño por archivo y escrituras secuenciadas. Planner documentó, architect definió límites, db adaptó repositorios, dev implementó API, test verificó y reviewer/security revisaron en solo lectura. Media se omitió porque no hay uploads. Prisma, migraciones, modelos, dependencias y validate.middleware.ts permanecen sin cambios. No se ejecutaron migraciones ni se integró a QA/main.

### Resultado verificado

- Build, prisma:validate, tipos estrictos de todos los tests y git diff --check: satisfactorios. Cliente Prisma regenerado desde el schema existente. OpenAPI válido y 77 referencias internas resueltas.
- Suite combinada inicial 83/84; final 84/84, cero omitidas: 36 existentes y 48 nuevas. El fallo inicial fue aceptar +02:00 como zona IANA; corregido y verificado. UTC y zonas IANA siguen admitidas.
- Comando ejecutado: `node --import tsx --test tests/community/*.test.ts tests/auth-community/*.test.ts`, con entorno sintético documentado en `tests/auth-community/README.md`.
- Reviewer y security: sin bloqueantes. Corregidos reintentos Mongo, proyección pública y timezone; rate limiting queda pendiente documentado.
- Aceptación verificada con dobles y HTTP local. Integración con bases reales, índices y concurrencia pendientes; no se mide porcentaje de cobertura.
- A petición posterior del usuario, se omiten más ejecuciones o ampliaciones de pruebas. Los resultados anteriores ya se habían obtenido.

## Criterios de aceptación

1. Tres rutas correctas, roles BASIC/EDITOR/ADMIN y estado ACTIVE reales, sin esquema duplicado.
2. Hash configurado, normalización única, JWT HS256 siete días y vigencia DB.
3. No nuevos Joi schemas ni cambios validate.middleware.
4. Logger y try/catch con catchAndLogError en capas operativas salvo routes; secretos ausentes.
5. Build/Prisma y pruebas pertinentes con resultados reales documentados y revisión independiente.
