# Salon de yoga

Base tecnica inicial para una aplicacion interna de gestion de un salon de yoga.

## Alcance de esta entrega

- Proyecto Next.js con TypeScript y Tailwind.
- Interfaz responsive con foco movil para agenda semanal.
- Datos ficticios de clases, alumnas habituales y asistencia.
- API integrada con endpoints para clases, alumnas y guardado validado de asistencia.
- Edicion de asistencia con cambios pendientes, guardado, deshacer y marcado grupal.
- PostgreSQL definido en Docker Compose con un esquema inicial.
- Preparado para autenticacion futura con Google, sin OAuth real todavia.

## Requisitos

- Node.js 22 o superior.
- Docker Desktop, si se quiere levantar app y base de datos en contenedores.

## Puesta en marcha local sin Docker

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abrir `http://localhost:3000`.

La aplicacion usa datos simulados, por lo que puede probarse incluso sin PostgreSQL. `DATABASE_URL` queda documentado para la siguiente etapa de persistencia.

## Puesta en marcha con Docker Compose

```bash
docker compose up --build
```

Servicios:

- App: `http://localhost:3000`
- PostgreSQL: `localhost:5432`
- Base: `yoga_salon`
- Usuario: `yoga`
- Password: `yoga`

El volumen `yoga_postgres_data` conserva los datos de PostgreSQL entre reinicios.

## Endpoints iniciales

```text
GET  /api/classes
GET  /api/classes?weekStart=2026-07-20
GET  /api/classes/:classId/attendance?date=2026-07-25
POST /api/classes/:classId/attendance
GET  /api/students
```

Ejemplo de `POST /api/classes/class-sab-0930/attendance`:

```json
{
  "date": "2026-07-25",
  "attendance": [
    { "studentId": "stu-paula", "status": "present" },
    { "studentId": "stu-ines", "status": "absent" }
  ]
}
```

El `POST` valida la fecha, la clase, las alumnas, los estados y los duplicados antes
de guardar. Los cambios quedan disponibles para los `GET` siguientes durante la
ejecucion del servidor. Al reiniciar la app se restauran los datos ficticios; la
persistencia durable en PostgreSQL queda para la siguiente etapa.

## Modelo de datos previsto

El archivo `db/init.sql` crea tablas para:

- `students`: alumnas.
- `weekly_classes`: clases fijas semanales.
- `class_enrollments`: asignacion habitual de alumnas a clases.
- `attendance_records`: asistencia por fecha de clase, editable tambien para fechas pasadas.

## Siguientes pasos sugeridos

1. Reemplazar el almacenamiento en memoria por consultas reales a PostgreSQL.
2. Agregar migraciones versionadas.
3. Incorporar autenticacion Google limitada a la administradora.
4. Agregar tests de rutas API y flujos principales de asistencia.
