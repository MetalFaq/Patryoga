# Runbook de publicación productiva

## Compuertas obligatorias

1. Árbol Git revisado y respaldado en el remoto privado.
2. `npm audit`, typecheck, lint y build sin errores.
3. Backup PostgreSQL nuevo y restauración completa en una base aislada.
4. Migraciones aplicadas mediante `schema_migrations`.
5. Imagen OCI identificada por versión, commit y fecha.
6. Dominio HTTPS, túnel permanente y callback OAuth exacto verificados.
7. Smoke tests autenticados desde escritorio y teléfono.

## Migraciones

`docker compose up` ejecuta primero el servicio de una sola ejecución
`migrate`. Cada archivo `db/migrations/*.sql` se aplica una vez, dentro de una
transacción, y se registra junto con su SHA-256 en `schema_migrations`.

Las migraciones aplicadas son inmutables: si cambia su checksum, el despliegue
falla cerrado. Toda evolución futura debe agregarse como un archivo nuevo con
un número mayor.

`db/init.sql` no participa del arranque productivo. Es una capa de
compatibilidad que carga el seed ficticio exclusivamente para pruebas.

## Construcción identificable

En PowerShell, antes de construir:

```powershell
$env:APP_VERSION = "0.1.0"
$env:VCS_REF = git rev-parse HEAD
$env:BUILD_DATE = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$env:IMAGE_TAG = "0.1.0-$($env:VCS_REF.Substring(0,12))"
docker compose build --pull app
```

Comprobar las etiquetas sin revelar variables de entorno:

```powershell
docker image inspect "patryoga:$env:IMAGE_TAG" --format '{{json .Config.Labels}}'
```

## Cloudflare y OAuth

- Usar un túnel administrado permanente, nunca `trycloudflare.com`.
- Publicar un hostname estable, por ejemplo `app.dominio.com`, hacia
  `http://app:3000` si `cloudflared` comparte la red de Compose o hacia
  `http://localhost:3000` si corre como servicio de Windows.
- Cambiar `AUTH_URL` al origen HTTPS exacto, sin barra final.
- Registrar en Google exactamente
  `https://app.dominio.com/api/auth/callback/google`.
- Recrear solamente la app después de cambiar `AUTH_URL`; la base no necesita
  reinicio.

## Limpieza inicial de datos

Sólo después de verificar backup restaurable, remoto Git y acceso público:

```powershell
docker compose exec -T db sh -c `
  'psql -v ON_ERROR_STOP=1 -v confirm=RESET_PATRYOGA_OPERATIONAL_DATA -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /opt/patryoga/db/maintenance/reset_operational_data.sql'
```

La operación elimina alumnas/os, clases, asignaciones y asistencias. Conserva
el esquema, el historial de migraciones y los planes iniciales de cuatro y
ocho clases. No usar `docker compose down -v`.

## Rollback

1. Detener sólo la aplicación.
2. Volver a la etiqueta de imagen anterior.
3. Si una migración alteró datos, restaurar el último backup validado en una
   base aislada antes de reemplazar el volumen productivo.
4. Arrancar la aplicación y comprobar `/api/health`, login, agenda, alumnas/os
   y planes.
