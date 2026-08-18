# Runbook de publicación y recuperación

## Estado de referencia

Patryoga está en piloto de adopción, no en producción definitiva. La línea base
validada incluye repositorio público en GitHub, CI, migraciones versionadas,
imagen OCI identificable, auditoría npm sin hallazgos conocidos, backup
restaurado, base operacional limpia y publicación HTTPS mediante Tailscale
Funnel. Se conservaron el esquema, `schema_migrations` y los planes iniciales de
4 y 8 clases.

El dominio propio, Cloudflare y el alojamiento permanente se posponen hasta
confirmar adopción. El runbook diario del piloto está en
`docs/adoption-pilot-runbook.md`.

## Compuertas para una versión

1. Árbol Git limpio, commit revisado y respaldado en el remoto.
2. CI remota aprobada; `npm audit`, typecheck, lint y build sin errores.
3. Backup PostgreSQL nuevo y restauración completa en una base aislada.
4. Migraciones aplicadas mediante `schema_migrations`.
5. Imagen OCI identificada por versión, commit y fecha.
6. Origen HTTPS estable y callback OAuth exacto verificados.
7. Smoke tests autenticados desde escritorio y teléfono.
8. Etiqueta anterior disponible y procedimiento de rollback acordado.

## Migraciones

`docker compose up` ejecuta primero el servicio de una sola ejecución
`migrate`. Cada archivo `db/migrations/*.sql` se aplica una vez, dentro de una
transacción, y se registra junto con su SHA-256 en `schema_migrations`.

Las migraciones aplicadas son inmutables: si cambia su checksum, el despliegue
falla cerrado. Toda evolución futura debe agregarse como un archivo nuevo con
un número mayor.

`db/init.sql` no participa del arranque operacional. Es una capa de
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

La imagen debe informar origen, versión, revisión y fecha, y ejecutar como el
usuario no privilegiado `nextjs`.

## Publicación actual con Tailscale

- Funnel termina HTTPS y reenvía sólo al puerto local de la aplicación.
- `AUTH_URL` debe coincidir con el origen HTTPS asignado, sin barra final.
- Google debe autorizar exactamente `<AUTH_URL>/api/auth/callback/google`.
- Después de cambiar `AUTH_URL`, recrear únicamente `app`; PostgreSQL no
  necesita reinicio.
- El hostname y las cuentas autorizadas son configuración operativa y no se
  copian a la documentación.

## Publicación productiva futura

Cuando se aprueben dominio y alojamiento:

1. desplegar la misma imagen identificable en el host elegido;
2. migrar PostgreSQL desde un backup restaurable;
3. aplicar las mismas migraciones versionadas;
4. publicar un hostname estable con HTTPS;
5. actualizar `AUTH_URL` y el callback OAuth exacto;
6. validar salud, login y flujos críticos antes de habilitar escrituras;
7. conservar el piloto como rollback temporal hasta la aceptación.

Si se elige Cloudflare, usar un túnel administrado permanente y nunca un Quick
Tunnel de `trycloudflare.com`. El diseño final debe exponer sólo la aplicación,
no PostgreSQL.

## Limpieza inicial de datos

La limpieza de adopción ya fue ejecutada después de comprobar remoto, backup
restaurable y acceso público. No debe repetirse en una base con datos reales.
El script se conserva como herramienta excepcional y requiere confirmación
explícita:

```powershell
docker compose exec -T db sh -c `
  'psql -v ON_ERROR_STOP=1 -v confirm=RESET_PATRYOGA_OPERATIONAL_DATA -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /opt/patryoga/db/maintenance/reset_operational_data.sql'
```

La operación elimina alumnas/os, clases, asignaciones y asistencias. Conserva
el esquema, el historial de migraciones y los planes iniciales de cuatro y
ocho clases. Requiere una autorización nueva, backup restaurable nuevo y una
ventana sin escrituras. Nunca usar `docker compose down -v`.

## Rollback

1. Evitar nuevas escrituras y detener sólo la aplicación.
2. Volver a la etiqueta de imagen anterior.
3. Si una migración alteró datos, restaurar el último backup validado en una
   base aislada antes de reemplazar cualquier volumen.
4. Arrancar la aplicación y comprobar `/api/health`, login, agenda,
   alumnas/os, asistencia y planes.
5. Reabrir escrituras sólo después de verificar integridad y acceso público.

No editar ni borrar migraciones ya aplicadas y no reutilizar una base destino
sin verificar sus datos.
