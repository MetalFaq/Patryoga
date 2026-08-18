# Arquitectura operacional de Patryoga

## Propósito y estado actual

Patryoga es una aplicación web interna para administrar alumnas/os, clases
semanales, asistencia y planes mensuales del salón. El piloto de adopción corre
en una computadora Windows con Docker Desktop y se publica mediante Tailscale
Funnel. La administradora accede por HTTPS e inicia sesión con Google.

El código fuente está respaldado en el repositorio público de GitHub
`MetalFaq/Patryoga`. La exposición actual es deliberadamente un piloto: no es
todavía el alojamiento productivo definitivo.

## Vista de componentes

```text
Teléfono o navegador
        |
        | HTTPS público
        v
Tailscale Funnel (servicio Windows, hostname asignado)
        |
        | sólo 127.0.0.1:3000
        v
Next.js 16 + Auth.js (contenedor app, usuario nextjs)
        |                  |
        | rol runtime      +--> Google OAuth 2.0
        v
PostgreSQL 16 (contenedor db, sin puerto publicado)
        |
        +--> volumen Docker yoga_postgres_data

migrate -- rol propietario --> esquema + grants runtime

GitHub --> CI: audit + tipos + lint + build
Dockerfile + commit --> imagen OCI identificable
db/migrations --> servicio migrate --> schema_migrations
```

## Responsabilidad de cada capa

| Capa | Responsabilidad | Relación principal |
| --- | --- | --- |
| Interfaz Next.js | Agenda, asistencia, alumnas/os, clases y planes | Consume las rutas `/api/*` del mismo despliegue |
| Auth.js + Google | Crea sesiones JWT y autoriza sólo correos verificados de la lista permitida | El proxy protege páginas y API de negocio |
| API App Router | Valida entradas y traduce errores del dominio a HTTP | Delega transacciones a los repositorios del servidor |
| Repositorios | Aplica solapamientos, cupos, vigencias, asistencia y pools mensuales | Usa el pool PostgreSQL de `src/lib/db.ts` |
| PostgreSQL | Fuente de verdad e historial operacional | El rol runtime sólo usa DML/secuencias de negocio; el propietario queda reservado para migrar |
| Migrador | Aplica cada SQL una sola vez, verifica su checksum y provisiona grants | Registra el resultado en `schema_migrations` antes de iniciar la app |
| Docker Compose | Ordena base, migración, aplicación, salud y reinicios | Inyecta configuración desde `.env`, que no se versiona |
| Tailscale Funnel | Termina HTTPS y reenvía sólo la web local | No publica PostgreSQL ni concede navegación por la LAN |
| GitHub Actions | Control de integración por cada cambio remoto | Ejecuta auditoría, tipos, lint y build |

La imagen operacional validada para el cierre de fase 2 es la versión `0.1.2`.
La aplicación quedó saludable y los cinco casos públicos de autenticación y
headers pasaron.

## Flujos principales

### Acceso autenticado

1. El navegador llega por HTTPS a Funnel.
2. Next.js redirige a `/login` si no hay sesión válida.
3. Google devuelve el callback OAuth al mismo origen público.
4. Auth.js exige correo verificado y pertenencia a la lista configurada.
5. El proxy permite entonces páginas y API de negocio. `/api/health` y las
   rutas internas de OAuth son las únicas excepciones públicas.

### Escritura de datos

1. La interfaz envía JSON a una ruta de negocio.
2. El rate limiter en memoria aplica ventanas separadas para autenticación y
   API; devuelve 429 y `Retry-After` cuando se excede el límite.
3. La ruta valida el contrato documentado en `docs/api-contract.md`.
4. El repositorio ejecuta la operación transaccional con el rol runtime.
5. Las restricciones de base y los bloqueos del dominio evitan duplicados,
   solapamientos y cupos inconsistentes.
6. La respuesta actualiza la interfaz; PostgreSQL conserva el resultado aunque
   la aplicación se reinicie.

El límite es fixed-window, por proceso y de una sola instancia. La confianza en
`X-Forwarded-For` depende de mantener la aplicación sólo en loopback detrás de
Funnel; un despliegue multi-réplica necesita almacenamiento compartido y una
política explícita de proxies confiables. `/api/health` está exento.

### Arranque y evolución del esquema

1. `db` debe quedar saludable.
2. `migrate` recorre `db/migrations/*.sql` en orden.
3. Una migración nueva se aplica en una transacción y registra versión y
   checksum. Una migración ya aplicada pero modificada hace fallar el arranque.
4. El provisionamiento idempotente garantiza el rol runtime y sus permisos
   sobre tablas y secuencias existentes.
5. Toda migración futura que cree tablas o secuencias debe ser seguida por
   `migrate` para otorgar los grants runtime correspondientes.
6. `app` inicia únicamente cuando `migrate` termina correctamente.

## Modelo de datos relacionado

- `students`: identidad estable y estado activo/archivado.
- `weekly_classes`: plantillas recurrentes de lunes a viernes.
- `class_enrollments`: períodos históricos de asignación habitual.
- `attendance_records`: presente o ausente por alumna/o, clase y fecha.
- `membership_plans`: catálogo; el piloto conserva planes de 4 y 8 clases.
- `monthly_plan_assignments` y `monthly_plan_sessions`: snapshot mensual
  completo o proporcional, consumo y evidencia para futuras estadísticas.
- `schema_migrations`: versiones y checksums aplicados.

Las relaciones históricas no se eliminan por una baja normal. El contrato del
dominio está detallado en `docs/domain-rules.md` y el HTTP en
`docs/api-contract.md`.

## Límites de confianza

- Internet alcanza la aplicación web, no PostgreSQL ni otros servicios de la
  red doméstica.
- La URL pública no es un secreto; la protección depende de Google, la lista de
  acceso y los controles del servidor.
- `.env` contiene secretos de runtime y permanece fuera de Git.
- La ACL de `.env` está restringida a las identidades operativas necesarias.
- Los backups se guardan en almacenamiento local ignorado por Git. Su carpeta
  todavía conserva una ACL más amplia de la deseada; corregirla requiere
  elevación administrativa. No deben copiarse a documentación ni a tickets.
- La imagen corre como usuario no privilegiado, pero Docker Desktop y la cuenta
  administradora del equipo siguen siendo activos críticos.

## Mapa de archivos

El índice visual navegable está en `docs/project-index.html`. Los puntos de
entrada más importantes son:

- `src/app/page.tsx`: interfaz operativa.
- `src/auth.ts`, `src/auth-environment.ts` y `src/proxy.ts`: autenticación y
  autorización.
- `src/app/api/**`: contratos HTTP ejecutables.
- `src/server/**`: reglas y transacciones del dominio.
- `src/lib/db.ts`: conexión a PostgreSQL.
- `db/migrations/**` y `db/migrate.sh`: evolución versionada.
- `docker-compose.yml` y `Dockerfile`: despliegue local e imagen OCI.
- `.github/workflows/ci.yml`: controles del repositorio remoto.
