# Patryoga

Aplicacion interna para gestionar clases semanales, alumnas y asistencia de un
salon de yoga.

## Alcance actual

- Proyecto Next.js con TypeScript y Tailwind.
- Interfaz responsive con foco movil para agenda y administracion.
- CRUD de alumnas, clases semanales, asignaciones y asistencia historica.
- Persistencia PostgreSQL y ejecucion local con Docker Compose.
- Autenticacion Google con una lista acotada de cuentas administradoras
  autorizadas.

## Requisitos

- Node.js 22 o superior.
- Docker Desktop para ejecutar la pila completa.
- Un cliente OAuth 2.0 de Google de tipo aplicacion web.

## Configuracion de autenticacion

Copiar `.env.example` a `.env.local` para ejecutar con Node.js, o a `.env` para
Docker Compose. Completar estas variables sin versionar el archivo resultante:

```dotenv
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_ALLOWED_EMAIL=
AUTH_TRUST_HOST=true
AUTH_URL=http://localhost:3000
```

- `AUTH_SECRET`: valor aleatorio de al menos 32 caracteres. Se puede generar
  con `npm exec auth secret`; no debe reutilizarse fuera de esta aplicacion.
- `AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET`: credenciales del cliente web creado
  en Google Cloud Console.
- `AUTH_ALLOWED_EMAIL`: lista de correos Google autorizados, separada por comas.
  Los espacios alrededor de cada entrada se ignoran.
- `AUTH_TRUST_HOST=true`: requerido por Auth.js en esta ejecucion Docker.
- `AUTH_URL`: origen publico de la app, sin barra final. En local se usa
  `http://localhost:3000`; al desplegar debe cambiarse al origen HTTPS real.

La aplicacion valida que Google haya verificado el correo y que coincida, sin
distinguir mayusculas, con alguna entrada de `AUTH_ALLOWED_EMAIL`. Cualquier
otra cuenta es rechazada. La configuracion tambien se rechaza por completo si
la lista esta vacia o si alguna entrada no es un correo valido. Si falta una
variable o la configuracion es invalida, las paginas redirigen a `/login`, las
APIs responden `503` y el inicio de sesion queda deshabilitado.

En el cliente OAuth de Google registrar para desarrollo:

```text
http://localhost:3000/api/auth/callback/google
```

Google exige coincidencia exacta de esquema, host, puerto y ruta.

## Puesta en marcha local sin Docker

Con PostgreSQL disponible en `localhost:5432`:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Completar `.env.local` y abrir `http://localhost:3000`.

## Puesta en marcha con Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Completar `.env` antes de iniciar. Servicios:

- App: `http://localhost:3000`
- PostgreSQL: sólo accesible dentro de la red privada de Compose (sin puerto
  publicado al host).
- Base, usuario y password: los valores `POSTGRES_DB`, `POSTGRES_USER` y
  `POSTGRES_PASSWORD` de `.env`.

El volumen `yoga_postgres_data` conserva PostgreSQL entre reinicios. Compose
lee autenticación y credenciales desde `.env`, las transmite a los contenedores
en runtime y no las incorpora a la imagen. Para el uso con Docker, la URL
interna se arma con esos valores y el hostname `db`; no uses `localhost` en esa
URL dentro del contenedor.

Para generar valores locales sin inventar credenciales en el repositorio, se
puede usar Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Usa una salida para `POSTGRES_PASSWORD` y otra para `AUTH_SECRET`. Mantén la
password de PostgreSQL en caracteres URL-safe (`A-Z`, `a-z`, `0-9`, `-`, `_`)
porque Compose construye `DATABASE_URL` con ella.

### Backup, restauración y actualización

El volumen nombrado no reemplaza un backup. Con la pila detenida o mientras
PostgreSQL está saludable, exporta un dump lógico al host:

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > patryoga-$(date +%Y-%m-%d).dump
```

En PowerShell, usa `docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' | Set-Content -Encoding Byte patryoga-backup.dump`.
Guarda el archivo fuera del repositorio y protégelo: contiene datos personales.
Para restaurar sobre una instancia vacía, detén la app y ejecuta:

```bash
docker compose stop app
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < patryoga-backup.dump
docker compose start app
```

Para actualizar la imagen después de revisar cambios locales, crea primero un
backup, luego ejecuta `docker compose build --pull app` y
`docker compose up -d`. No uses `docker compose down -v`: elimina el volumen y
los datos persistentes.

Si el puerto 3000 ya está ocupado, se puede usar temporalmente otro puerto del
host con `APP_PORT=3100 docker compose up -d` (en PowerShell:
`$env:APP_PORT="3100"; docker compose up -d`). El puerto interno de la app
continúa siendo 3000.

La imagen usa Node.js Alpine y PostgreSQL Alpine, sin dependencias exclusivas
de Windows; Docker Desktop puede construirla para amd64 y arm64 cuando el
daemon/plataforma destino lo soporte. No se configura publicación remota,
Cloudflare, DNS ni proxy.

## Callback publico futuro

Cuando exista un dominio HTTPS, agregar en el mismo cliente OAuth o en uno
separado para produccion:

```text
https://<dominio>/api/auth/callback/google
```

Configurar las mismas variables como secretos del entorno de despliegue. No se
configuran todavia Cloudflare, DNS ni proxy en este repositorio. Si la
aplicacion queda detras de un proxy confiable, conservar
`AUTH_TRUST_HOST=true`.

## Endpoints

```text
GET    /api/classes
POST   /api/classes
PATCH  /api/classes/:classId
DELETE /api/classes/:classId
GET    /api/classes/:classId/attendance?date=2026-07-25
POST   /api/classes/:classId/attendance
GET    /api/students
POST   /api/students
PATCH  /api/students/:studentId
DELETE /api/students/:studentId
POST   /api/students/:studentId/classes
DELETE /api/students/:studentId/classes
GET    /api/auth/session
```

Todos los endpoints de negocio requieren la sesion de la administradora. Los
contratos completos estan en `docs/api-contract.md` y las reglas funcionales
en `docs/domain-rules.md`.

## Modelo de datos

`db/init.sql` crea:

- `students`: alumnas.
- `weekly_classes`: clases fijas semanales.
- `class_enrollments`: asignaciones habituales con vigencia.
- `attendance_records`: asistencia por clase, alumna y fecha.

## Verificacion

```bash
npm run typecheck
npm run lint
npm run build
docker compose config
```

Las suites de API y sus variables estan documentadas en `tests/README.md`.

La verificación de despliegue local también debe confirmar que `docker compose
config` no contiene `5432:` bajo `ports`, que `docker compose build` termina
correctamente y que `docker compose up -d` deja `app` y `db` saludables. Se
puede comprobar con `docker compose ps` y abrir `http://localhost:3000`.

La auditoría de dependencias y la actualización masiva de paquetes quedan
pendientes para una tarea separada; esta fase no modifica versiones de npm.

## Siguientes pasos

1. Agregar migraciones versionadas.
2. Definir dominio, HTTPS y secretos del entorno publico.
3. Incorporar auditoria de cambios administrativos.
