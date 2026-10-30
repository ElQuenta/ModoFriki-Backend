# US2 — concurrencia con proveedores reales

Fecha: 2026-10-30. Entorno desechable: PostgreSQL local `mf_admin_test_phase4us2` y MongoDB local como replica set de un nodo `mfPhase4Rs`; no se usaron mocks para estas pruebas.

Comando ejecutado:

```powershell
$env:TEST_DATABASE_URL='postgresql://angel@127.0.0.1:55432/mf_admin_test_phase4us2?sslmode=disable'
$env:TEST_MONGODB_URI='mongodb://127.0.0.1:27028/mf_admin_test_phase4db?replicaSet=mfPhase4Rs&directConnection=true'
npx vitest run --config vitest.integration.config.ts
```

Resultado: 9 archivos, 53 pruebas aprobadas.

La suite de creación verifica prepare/replay con ventana fija de 60 segundos, stage durable con lectura primary/majority, conflicto de contenido, sanción que gana sobre staging tardío, rechazo terminal `EXPIRED`, raíz/respuesta y padre eliminado, y retirada ganadora de WORK, CHAPTER u obra padre con `TARGET_UNAVAILABLE`. La suite de sanciones verifica la serialización sanción/prepare, expiración perezosa, revocación por UUID concreto y evidencia ajena. Las páginas vacías y el cursor se cubren en el contrato HTTP.

El despliegue requiere drenar writers antiguos y activar conjuntamente writer y readers con filtro de decisiones.
