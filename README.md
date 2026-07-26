# Patryoga

Aplicacion interna para gestionar clases semanales, alumnas y asistencia de un
salon de yoga.

## Alcance actual

- Proyecto Next.js con TypeScript y Tailwind.
- Interfaz responsive con foco movil para agenda y administracion.
- CRUD de alumnas, clases semanales, asignaciones y asistencia historica.
- Persistencia PostgreSQL y ejecucion local con Docker Compose.
- Autenticacion Google con una unica cuenta administradora autorizada.

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
- `AUTH_ALLOWED_EMAIL`: correo Google exacto de la unica administradora.
- `AUTH_TRUST_HOST=true`: requerido por Auth.js en esta ejecucion Docker.
- `AUTH_URL`: origen publico de la app, sin barra final. En local se usa
  `http://localhost:3000`; al desplegar debe cambiarse al origen HTTPS real.

La aplicacion valida que Google haya verificado el correo y que coincida, sin
distinguir mayusculas, con `AUTH_ALLOWED_EMAIL`. Cualquier otra cuenta es
rechazada. Si falta una variable, las paginas redirigen a `/login`, las APIs
responden `503` y el inicio de sesion queda deshabilitado.

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
- PostgreSQL: `localhost:5432`
- Base: `yoga_salon`
- Usuario local: `yoga`
- Password local: `yoga`

El volumen `yoga_postgres_data` conserva PostgreSQL entre reinicios. Compose
lee la autenticacion desde `.env` y la transmite al contenedor sin incorporarla
a la imagen.

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

## Siguientes pasos

1. Agregar migraciones versionadas.
2. Definir dominio, HTTPS y secretos del entorno publico.
3. Incorporar auditoria de cambios administrativos.
