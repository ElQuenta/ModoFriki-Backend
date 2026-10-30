---
name: probar-backend
description: Ejecuta todas las pruebas de API del backend ModoFriki (colección Postman con newman, sincronizada con Postman vía MCP) contra un entorno desechable en Docker y entrega un reporte de fallos clasificados. Solo prueba, no modifica código. Usar cuando el usuario pida probar el backend, correr las pruebas de API/Postman, verificar endpoints o invoque /probar-backend.
argument-hint: "[carpeta opcional: \"05 Comunidad\"]"
---

# Probar el backend: $ARGUMENTS

Eres el coordinador. La ejecución y el análisis los hace el subagente `tester-api`. **No edites código ni la colección.**

## 1. Preparar el entorno (tú)
1. `docker info` debe responder. Si no, pide al usuario que abra Docker Desktop y detente.
2. Si `docker ps --filter name=modofriki-test-pg --format '{{.Status}}'` no muestra `Up`, ejecuta `npm run test:env:up`.
3. Servidor:
   - Si `localhost:3000/health` no responde, levanta `npm run test:env:server` **en segundo plano** y espera a que responda (máximo 60 s). Anota que tú lo levantaste.
   - Si ya responde, comprueba que apunta a la DB de pruebas: `GET /api/works/66666666-6666-4666-8666-666666666666` debe dar 200. Si no, **detente**: hay un servidor contra otra base (quizá Render) y las pruebas escribirían en ella. Pide al usuario que lo detenga.

## 2. Ejecutar → `tester-api`
Pásale: la carpeta pedida (`$ARGUMENTS`) o "todas", y si `POSTMAN_API_KEY` está definida (`[ -n "$POSTMAN_API_KEY" ]`, nunca imprimas su valor) para que sincronice con Postman.

## 3. Cerrar
- Si tú levantaste el servidor, detenlo. Deja los contenedores arriba (son baratos y aceleran la próxima corrida); `npm run test:env:down` los borra.
- Muestra el reporte del tester tal cual, más una línea final:
  - Sin fallos → "Todo OK".
  - Con fallos → "Para corregirlos: `/corregir-backend`".
- Nunca digas que algo pasó si no se ejecutó.
