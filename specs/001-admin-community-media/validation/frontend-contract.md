# Contrato de consumidor — US3

- Repositorio consumidor: **PENDIENTE de identificación por su responsable**.
- Versión/SHA: **PENDIENTE**.
- Responsable y fecha: **PENDIENTE**.
- Entorno: contrato backend local, rama `feature/admin-community-media-phase-5`.

## Contrato entregado

`CatalogWork` expone `bannerAsset` nullable e independiente de `coverAsset` e
`incapBannerAsset`. `CatalogChapter.pages` conserva la colección editorial.
`CatalogChapter.readingImages` agrega una secuencia de lectura: `WORK_OPENING`
tiene `pageId` y `position` en null; `PAGE` conserva ambos valores editoriales.
El consumidor debe renderizar exclusivamente `readingImages` al leer, sin
preagregar `incapBannerAsset`.

## Escenarios que requieren aceptación del consumidor

| Escenario | Resultado backend | Aceptación |
| --- | --- | --- |
| Página vacía con `hasMore=true` en comentarios | Continuar cursor; no tratarla como final | PENDIENTE |
| Confirmación tardía de comentario | Reiniciar desde primera página y reemplazar colección local | PENDIENTE |
| Apertura y páginas | Una apertura opcional más N páginas, sin duplicar | PENDIENTE |
| Progreso | La apertura no altera IDs ni posiciones de `pages` | PENDIENTE |

La evidencia y aceptación explícita del responsable del consumidor son una
dependencia externa. Este documento no afirma validación en otro repositorio y
bloquea el gate de despliegue T067, no las pruebas de backend de US3.
