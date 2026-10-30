# Contrato de consumidor — US3 / gate T067

Actualizado: 2026-10-30.

- Repositorio identificado por el usuario: https://github.com/ElQuenta/ModoFriki-Web
- Despliegue identificado por el usuario: https://modo-friki-web.vercel.app/
- Referencia local inspeccionada: rama dev, ref HEAD
  `b5adde7c1b8107bb09636bcd88b15f5567d40767`.
- Versión/SHA efectivamente probada y desplegada: **PENDIENTE**. El ref local no
  acredita commit remoto actual, checkout limpio ni versión de Vercel.
- Responsable nominal y aceptación explícita: **PENDIENTE**.
- Entorno de validación integrada de los cuatro escenarios: **PENDIENTE**.

Se consultó la página pública del repositorio y, en modo lectura, la copia local
hermana. Git rechazó su ownership desde el sandbox; no se cambió safe.directory
ni configuración global. El SHA anterior se observó leyendo HEAD y su ref. No se
modificó ni ejecutó el frontend. La herramienta web no pudo abrir el despliegue;
eso no demuestra una caída del servicio.

La copia local inspeccionada mantiene DEP-004 en integration-matrix.md y tareas
T077; src/services/catalog.ts solo modela coverAsset/incapBannerAsset y pages y
mapea incapBannerAsset a bannerUrl. No se encontraron referencias a readingImages
en src. Es una observación de esa copia, no un diagnóstico del despliegue.
Además sus documentos exigen tres imágenes incluso DRAFT, mientras el backend
permite DRAFT incompleto: alinear esa política durante la adaptación del consumidor.

## Contrato backend entregado

CatalogWork expone bannerAsset independiente de coverAsset e incapBannerAsset.
El detalle GET CatalogChapterDetail agrega readingImages: WORK_OPENING tiene
pageId/position null y PAGE conserva IDs/posiciones. Listas/mutaciones mantienen
CatalogChapter/pages. El lector renderiza readingImages sin preagregar apertura.

| Escenario | Conducta requerida | Resultado integrado / aceptación |
| --- | --- | --- |
| Página vacía hasMore=true | Continuar cursor sin tratarla como final | PENDIENTE |
| Confirmación tardía | Reiniciar sin cursor y reemplazar colección local | PENDIENTE |
| Apertura y páginas | Una apertura opcional más N páginas sin duplicación | PENDIENTE |
| Progreso editorial | Apertura no altera IDs/posiciones de pages | PENDIENTE |

El responsable debe aportar SHA efectivamente probado, entorno/fecha y evidencia
de cada escenario, y aceptar explícitamente esa versión. El enlace al repositorio
y una aprobación de QA no sustituyen esa validación. T067 permanece pendiente,
sin bloquear las pruebas backend ya ejecutadas ni afirmar cambios en otro repo.
