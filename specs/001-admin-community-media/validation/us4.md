# Validación US4 — mensaje final como página ordinaria

## Resultado

No fue necesaria una entidad, columna, endpoint o middleware de cierre. El
pipeline existente de `pages` ya permite crear, sustituir, insertar y reordenar
una última página mediante los permisos editoriales vigentes.

## Evidencia

- Contrato HTTP: el último `PAGE` aparece una vez en `pages` y una vez en
  `readingImages`; una apertura opcional conserva `pageId` y `position` null.
- Capítulo sin página final: válido; no se inserta contenido automático.
- Límites: una página final cuenta dentro de las 100 por solicitud y 1000 por
  capítulo; intentar insertar sobre 1000 se rechaza.
- Permisos y concurrencia: se reutilizan `catalogPreflight`, `authorize`, locks
  de obra y `expectedVersion` del flujo de páginas existente. No se amplió la
  superficie de permisos.

## Revisión FR-017

FR-017 se satisface como comportamiento existente documentado: la decisión y
posición del mensaje final son editoriales; `SiteSettings.generalBannerAsset`
no interviene y no existe un cierre automático.
