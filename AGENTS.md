# Instrucciones generales

## Contexto del proyecto

Backend de plataforma de cómics y manhwas.

Tecnologías principales:
- Node.js, ExpressJS y TypeScript.
- PostgreSQL mediante Prisma.
- MongoDB mediante Mongoose.
- Multer y Vercel Blob para archivos multimedia.

IMPORTANTE: Este proyecto ya existe. No es un proyecto nuevo.

Antes de modificar código:
1. Inspeccionar package.json y tsconfig.json.
2. Revisar prisma/schema.prisma y configuración real de Prisma.
3. Revisar src/config/database y src/config/env.ts.
4. Revisar src/app.ts, src/index.ts y el registro de rutas.
5. Revisar handlers, middlewares y utilidades existentes.
6. Identificar scripts de test, lint, build y migración disponibles.
7. Reutilizar convenciones y dependencias existentes.

No reemplazar configuraciones funcionales ni regenerar el proyecto.

El repositorio público ElQuenta/TankoBase puede servir como
referencia funcional, pero no debe considerarse idéntico
al código local ni copiarse sin evaluación.

## Arquitectura obligatoria

Routes:
- Definen endpoints y orden de middlewares.
- No implementan lógica de negocio ni consultas de datos.

Controllers:
- Extraen datos de req.params, req.query, req.body y res.locals.
- Invocan Services.
- Utilizan los handlers de respuesta existentes.
- No realizan consultas Prisma/Mongoose.

Services:
- Implementan reglas de negocio.
- Coordinan repositorios y verifican invariantes.
- No dependen directamente de Request o Response.
- No realizan subidas a Blob: esa operación pertenece
  al pipeline de middlewares.

Repositories:
- Encapsulan Prisma, Mongoose y operaciones de persistencia.
- No conocen Express ni Request/Response.
- Evitan duplicar consultas y lógica de acceso a datos.

Models:
- Contienen schemas y modelos Mongoose cuando corresponda.

Validations:
- Contienen esquemas de validación cuando el proyecto
  ya utiliza una librería apropiada.

Config:
- Centraliza clientes de bases de datos y entorno.
- Reutiliza conexiones existentes.
- Nunca expone credenciales en respuestas o logs.

## Estructura existente

Respetar y reutilizar:
- src/config/database/
- src/config/env.ts
- src/generated/prisma/
- src/handlers/
- src/middlewares/
- src/utils/
- src/app.ts
- src/index.ts
- prisma/

Crear carpetas nuevas solo cuando la feature las necesite.

## Pipeline multimedia obligatorio

Para endpoints que suben archivos:

1. Autenticación.
2. Autorización y verificación previa del recurso.
3. Multer: recepción de multipart/form-data.
4. Validación de tamaño, cantidad, tipo y contenido.
5. Middleware Vercel Blob: subida del archivo.
6. Controller: extracción de datos y metadatos.
7. Service: reglas de negocio.
8. Repository: persistencia de referencias.

El middleware de Blob entrega metadatos tipados mediante
res.locals.uploadedMedia, o reutiliza una convención
equivalente si ya existe.

Los metadatos pueden incluir:
- url
- pathname
- contentType
- size

No guardar buffers en PostgreSQL ni MongoDB.
Guardar referencias y metadatos, según el modelo real.

Usar límites explícitos en Multer.
No confiar únicamente en el MIME enviado por el cliente.
No usar nombres de archivo sin sanitizar.
No registrar tokens de Blob.

Si la persistencia falla después de subir a Blob,
implementar o documentar compensación y limpieza.
No asumir transacciones distribuidas entre proveedores.

Para archivos grandes, evaluar streaming o carga directa;
no utilizar memoryStorage sin límites apropiados.

## Persistencia

Antes de crear entidades:
- Identificar qué base es fuente de verdad.
- Evitar entidades autoritativas duplicadas.
- Preferir relaciones transaccionales en PostgreSQL.
- Utilizar MongoDB donde su modelo documental aporte valor.
- Mantener las referencias Blob como metadatos.

No ejecutar operaciones destructivas sin autorización:
- prisma migrate reset
- DROP TABLE
- Eliminaciones masivas
- Borrado de colecciones
- Migraciones irreversibles

No modificar manualmente código generado de Prisma.
Revisar el output configurado antes de regenerarlo.

## Convenciones de implementación

- Mantener TypeScript estricto según tsconfig.
- Seguir el estilo existente de nombres y exportaciones.
- Utilizar AppError y handlers existentes si corresponde.
- Validar entradas y permisos antes de efectos externos.
- No introducir nuevas dependencias sin justificación.
- No modificar .env ni publicar secretos.
- No modificar código ajeno a la tarea.
- No inventar scripts de npm.

## Trabajo con subagentes

El agente principal coordina el trabajo.

Roles:
- planner: análisis y división de tareas.
- dev: implementación.
- db: modelos, consultas y migraciones.
- test: planificación y pruebas.
- media: Multer y Vercel Blob.
- reviewer: revisión independiente.
- security: auditoría especializada opcional.
- architect: decisiones estructurales opcionales.

Antes de delegar:
1. Definir feature y criterios de aceptación.
2. Identificar dependencias.
3. Asignar archivos o módulos por responsable.
4. Evitar dos agentes editando el mismo archivo.
5. Definir rama o worktree de cada implementador.

Los subagentes no reciben automáticamente worktrees
aislados. Para aislamiento real, utilizar sesiones
independientes de Codex en worktrees diferentes.

## Git e integración

- No hacer commits directamente a main o QA.
- Dev puede commitear únicamente en su rama asignada.
- DB y Media siguen las mismas restricciones si editan.
- Ningún subagente integra por su cuenta en QA o main.
- La integración requiere revisión y validaciones.
- No utilizar git push --force en ramas compartidas.
- No utilizar git reset --hard para descartar trabajo ajeno.
- No resolver conflictos ignorando cambios.
- Solicitar aprobación humana antes de integrar a QA.

## Contrato de entrega

Cada agente informa:
- Objetivo y resultado.
- Archivos inspeccionados o modificados.
- Decisiones relevantes.
- Validaciones ejecutadas y resultado real.
- Riesgos, bloqueos y trabajo pendiente.
- Rama y commit SHA, si aplica.

Nunca afirmar que una prueba pasó si no se ejecutó.

Consultar docs/agents/WORKFLOW.md.
