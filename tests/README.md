# Pruebas de contrato de API

La suite usa únicamente las APIs nativas de Node.js y no requiere cambios en
`package.json`. Con PostgreSQL y Next.js levantados, ejecutar desde la raíz:

```bash
node --test tests/api-contract.test.mjs
```

Variables opcionales:

- `BASE_URL`: URL de la aplicación (por defecto `http://localhost:3000`).
- `ATTENDANCE_TEST_DATE`: fecha ISO pasada usada por la suite (por defecto
  `1999-01-04`). Elegir una fecha aislada si se comparte una base de datos.
- `RESTART_SERVICES=1`: habilita el caso de persistencia; guarda una marca,
  ejecuta `docker compose restart app`, espera a que vuelva la API y comprueba
  que PostgreSQL conserva la marca. Requiere Docker Compose y una instancia
  iniciada con `docker-compose.yml`.

La prueba de solicitud inválida compara el estado completo antes y después,
por lo que detecta escrituras parciales. La prueba de 404 verifica que la
clase válida no haya sido alterada por una solicitud dirigida a una clase
inexistente.
