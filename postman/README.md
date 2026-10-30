# Pruebas de API (Postman + newman)

La colección `ModoFriki-API.postman_collection.json` prueba **63 requests / 302 aserciones**: salud, auth, catálogo, descubrimiento, lectura/biblioteca y comunidad. Incluye casos felices y negativos (400, 401, 403, 404, 409) y verifica en cada respuesta que nunca aparezca `passwordHash`.

Corre contra una **base desechable en Docker**, nunca contra la DB compartida de Render.

## Requisitos (una sola vez)

1. **Docker Desktop** abierto.
2. `npm install` (instala `newman`).
3. *(Opcional, para ver la colección en la app de Postman)* tu **propia** API key de Postman:
   1. Créala en <https://postman.postman.co/settings/me/api-keys>.
   2. Guárdala como variable de entorno del sistema. **Nunca la pongas en el repo ni en `.env`**: Claude Code no lee el `.env` para el MCP.
      - Windows (PowerShell): `setx POSTMAN_API_KEY "PMAK-..."`
      - macOS/Linux: agrega `export POSTMAN_API_KEY="PMAK-..."` a `~/.zshrc` o `~/.bashrc`.
   3. Reinicia VS Code / Claude Code y acepta el servidor MCP `postman` cuando lo pida (o revísalo con `/mcp`).

Sin la key todo funciona igual: solo se salta la sincronización con Postman.

## Uso con Claude Code

| Comando | Qué hace |
| --- | --- |
| `/probar-backend` | Levanta el entorno, ejecuta toda la colección y reporta los fallos clasificados. No toca código |
| `/probar-backend "05 Comunidad"` | Solo esa carpeta (y `01 Auth`, que genera los tokens) |
| `/corregir-backend` | Prueba, corrige los bugs en la causa raíz, vuelve a probar y te deja los cambios para revisar. **No hace commit** |

## Uso manual

```bash
npm run test:env:up       # Postgres :55432 + Mongo :27027, migraciones, seed y fixtures
npm run test:env:server   # backend en :3000 contra esas bases (deja esta terminal abierta)
npm run test:api          # en otra terminal: ejecuta la colección
npm run test:env:down     # al terminar: borra contenedores y datos
```

El reporte JSON de la última corrida queda en `postman/reports/last-run.json` (ignorado por git).

Para abrirla en la app de Postman sin MCP: *Import* → `ModoFriki-API.postman_collection.json` y `local.postman_environment.json`.

## Datos de prueba

`fixtures/test-data.sql` crea, con ids fijos:

| Dato | Valor |
| --- | --- |
| Admin | `admin.test@modofriki.local` / `ModoFriki-Test-2026` |
| Lector (BASIC) | `lector.test@modofriki.local` / `ModoFriki-Test-2026` |
| Obra publicada | `66666666-6666-4666-8666-666666666666` (2 capítulos con páginas) |
| Obra en borrador | `66666666-6666-4666-8666-666666666667` (debe dar 404 al público) |

Estas credenciales solo existen en la base desechable. Cada corrida registra además un usuario nuevo (`tester_<id>@modofriki.local`), así que las pruebas no dependen unas de otras.

## Mantener la colección

- **La fuente de verdad es el archivo del repo.** Si editas la colección en Postman, expórtala (v2.1) sobre este archivo y súbela en un PR.
- Las aserciones siguen el comportamiento real del código. Donde `docs/API.md` dice otra cosa (por ejemplo, `/works` hoy devuelve un array y no `Paginated`), la prueba refleja lo implementado.
