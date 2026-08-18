# Runbook diario del piloto de adopción

## Línea base validada

El piloto quedó preparado con:

- código respaldado en GitHub y controles de CI;
- imagen OCI identificable por versión, commit y fecha;
- migraciones versionadas registradas en PostgreSQL;
- auditoría npm sin vulnerabilidades conocidas al 17 de agosto de 2026;
- backup lógico restaurado con éxito en una base aislada;
- base operacional limpia, conservando el esquema y los planes de 4 y 8
  clases;
- acceso HTTPS mediante Tailscale Funnel y autenticación Google.

No publicar en la documentación el hostname, correos permitidos, credenciales,
IDs de cuenta ni ubicación o hash de los respaldos.

## Encendido diario

1. Conectar la computadora a corriente y a una red estable.
2. Iniciar sesión en Windows y esperar a que Docker Desktop indique que está
   listo.
3. Abrir PowerShell en la carpeta del proyecto.
4. Ejecutar:

   ```powershell
   docker compose up -d
   docker compose ps
   ```

5. Confirmar que `db` y `app` figuran como `healthy`; `migrate` debe haber
   terminado con código cero.
6. Verificar localmente:

   ```powershell
   Invoke-RestMethod http://localhost:3000/api/health
   ```

   La respuesta esperada es `status: ok`. Este endpoint confirma que el proceso
   web responde; no consulta PostgreSQL. La disponibilidad de la base se valida
   por separado comprobando que `db` figure como `healthy` en
   `docker compose ps`.
7. Ejecutar `tailscale status` y `tailscale funnel status`. El Funnel existente
   debe apuntar a la aplicación local; no crear otro hostname para un arranque
   normal.
8. Abrir el enlace público guardado en un navegador, iniciar sesión con una
   cuenta autorizada y comprobar Agenda, Alumnas/os y Planes.

## Durante el uso

- Windows puede quedar bloqueado y la pantalla puede apagarse.
- Mientras el equipo esté conectado a corriente, suspensión e hibernación
  deben permanecer en `Nunca`.
- Evitar cerrar la sesión de Windows: Tailscale funciona de forma desatendida,
  pero Docker Desktop puede depender de esa sesión.
- No apagar, reiniciar ni instalar actualizaciones durante una clase.
- Mantener la computadora ventilada y conectada a una fuente estable.

Comprobación rápida sin interrumpir a la administradora:

```powershell
docker compose ps
docker compose logs --since 15m app
docker compose logs --since 15m db
```

No copiar logs completos a chats públicos: podrían contener datos operativos.
Compose rota automáticamente los logs de cada contenedor al alcanzar 10 MB y
conserva hasta tres archivos. Esta rotación limita uso de disco, pero no
reemplaza alertas ni backups.

## Diagnóstico por síntoma

| Síntoma | Comprobación | Acción segura |
| --- | --- | --- |
| No abre la URL pública | Probar `/api/health` local y `tailscale funnel status` | Si local funciona, revisar internet y el servicio Tailscale |
| Local tampoco responde | `docker compose ps` | Revisar salud y logs antes de reiniciar |
| `/api/health` responde pero `db` no está saludable | `docker compose ps` y `docker compose logs --since 15m db` | El proceso web está vivo, pero la operación puede fallar; no borrar el volumen y detener el diagnóstico si aparecen errores de datos o credenciales |
| `app` no está saludable | `docker compose logs --since 15m app` | Confirmar que `migrate` terminó y que la base está saludable |
| Google rechaza el callback | Comparar el origen público con `AUTH_URL` y la URI autorizada de Google | Corregir sólo la configuración; recrear únicamente `app` |
| La API devuelve 401 | Verificar sesión y cuenta autorizada | Cerrar sesión y entrar con la cuenta correcta |
| La API devuelve 503 | Revisar `/api/health`, configuración y logs | No continuar cargando datos hasta recuperar la salud |

## Reinicio mínimo

Si el diagnóstico confirma que sólo la aplicación necesita reinicio:

```powershell
docker compose up -d --no-deps --force-recreate app
docker compose ps
```

No reiniciar la base para recargar una página. Nunca usar
`docker compose down -v`: elimina el volumen persistente.

Después de reiniciar Windows:

1. iniciar sesión;
2. confirmar que Docker Desktop está listo;
3. repetir la lista de encendido diario;
4. verificar Funnel, salud local y acceso público.

## Pausa planificada

Para dejar de publicar temporalmente, detener Funnel con la herramienta de
Tailscale antes de detener la aplicación. La base puede permanecer encendida o
detenerse con `docker compose stop`; esto no elimina su volumen.

Para reanudar, usar `docker compose up -d`, comprobar salud y volver a habilitar
el mismo Funnel. No cambiar `AUTH_URL` si el hostname permanece igual.

## Cambios y actualizaciones

Antes de incorporar una versión:

1. revisar el diff y la CI del commit;
2. ejecutar `npm audit`, typecheck, lint y build;
3. crear un backup y probar su catálogo o restauración aislada;
4. construir una imagen con versión y commit identificables;
5. dejar que `migrate` aplique migraciones nuevas;
6. realizar smoke tests locales y públicos;
7. conservar la etiqueta de imagen anterior para rollback.

Las instrucciones completas de publicación y rollback están en
`docs/production-runbook.md`.
