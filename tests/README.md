# Pruebas de contrato de API

La validacion de la configuracion de autenticacion no necesita servicios
levantados. Ejecutar desde la raiz:

```bash
node --test tests/auth-environment.test.mjs
```

La prueba de acceso usa las APIs nativas de Node.js y `next-auth/jwt` para crear
sesiones locales firmadas. Con Next.js levantado usando los mismos `AUTH_SECRET`
y `AUTH_ALLOWED_EMAIL`, ejecutar:

```bash
node --test tests/auth-access.test.mjs
```

```bash
node --test tests/api-contract.test.mjs
```

Para ejecutar las pruebas de gestión:

```bash
node --test tests/management-api.test.mjs
```

La prueba de reejecución de `db/init.sql` está omitida por defecto porque
requiere Docker Compose y ejecuta `psql` dentro del contenedor de PostgreSQL.
Con los servicios levantados, habilitarla así:

```bash
RUN_SEED_TEST=1 node --test tests/management-api.test.mjs
```

En PowerShell, usar `$env:RUN_SEED_TEST = "1"` antes del comando. Los datos de
prueba usan identificadores únicos; al terminar, las entidades creadas quedan
archivadas para no eliminar historial.

Variables opcionales:

- `BASE_URL`: URL de la aplicación (por defecto `http://localhost:3000`).
- `ATTENDANCE_TEST_DATE`: fecha ISO pasada usada por la suite (por defecto
  `1999-01-04`). Elegir una fecha aislada si se comparte una base de datos.
- `RESTART_SERVICES=1`: habilita el caso de persistencia; guarda una marca,
  ejecuta `docker compose restart app`, espera a que vuelva la API y comprueba
  que PostgreSQL conserva la marca. Requiere Docker Compose y una instancia
  iniciada con `docker-compose.yml`.

Variables requeridas:

- `AUTH_SECRET`: el mismo valor de 32 o mas caracteres usado por la app.
- `AUTH_ALLOWED_EMAIL`: la misma lista de correos separados por comas
  configurada en la app. La prueba de acceso comprueba cada cuenta de la lista.

La cookie de prueba existe solamente en el proceso de la suite. No hay un modo
de bypass ni una credencial fija dentro de la aplicacion.

La prueba de solicitud inválida compara el estado completo antes y después,
por lo que detecta escrituras parciales. La prueba de 404 verifica que la
clase válida no haya sido alterada por una solicitud dirigida a una clase
inexistente.
