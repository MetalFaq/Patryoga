# Contrato inicial de API

Este documento fija el contrato de la API integrada mientras la aplicacion usa
datos ficticios y persistencia en memoria. PostgreSQL debe mantener este
comportamiento salvo que el contrato se cambie de forma coordinada.

## Convenciones

- Fechas: texto ISO `YYYY-MM-DD`, tratado como fecha de calendario sin hora.
- Horas de clases: texto `HH:mm`.
- Respuestas y solicitudes: JSON con `Content-Type: application/json`.
- Errores: `{ "error": "descripcion" }` con un estado HTTP adecuado.
- Estados de asistencia: `present`, `absent` o `unmarked`.
- `dataSource` es informativo durante la transicion desde mocks.

## Tipos de respuesta

```ts
type Student = {
  id: string;
  name: string;
  phone: string;
  notes?: string;
};

type WeeklyClass = {
  id: string;
  title: string;
  weekday: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
  time: string;
  durationMinutes: number;
  teacher: string;
  room: string;
  capacity: number;
  studentIds: string[];
};

type ClassSession = WeeklyClass & {
  date: string;
  students: Array<Student & {
    status: "present" | "absent" | "unmarked";
  }>;
};
```

## `GET /api/classes`

Devuelve las sesiones de una semana.

Consulta opcional:

- `weekStart`: fecha ISO del lunes de la semana solicitada. Actualmente se
  valida el formato, pero no que corresponda a un lunes.

Respuesta `200`:

```json
{
  "dataSource": "runtime",
  "sessions": []
}
```

Errores:

- `400`: `weekStart` no es una fecha ISO valida.

## `GET /api/students`

Devuelve el catalogo de alumnas.

Respuesta `200`:

```json
{
  "dataSource": "mock",
  "students": []
}
```

## `GET /api/classes/:classId/attendance`

Devuelve una sesion y el estado de sus alumnas asignadas.

Consulta requerida:

- `date`: fecha ISO de la sesion.

Respuesta `200`:

```json
{
  "dataSource": "runtime",
  "session": {}
}
```

Errores:

- `400`: falta `date` o no es una fecha ISO valida.
- `404`: `classId` no identifica una clase.

## `POST /api/classes/:classId/attendance`

Guarda un conjunto parcial de estados para una clase y fecha.

Solicitud:

```json
{
  "date": "2026-07-25",
  "attendance": [
    { "studentId": "stu-paula", "status": "present" },
    { "studentId": "stu-ines", "status": "absent" }
  ]
}
```

Respuesta `200`:

```json
{
  "dataSource": "runtime",
  "message": "Attendance saved",
  "saved": [
    {
      "classId": "class-sab-0930",
      "studentId": "stu-paula",
      "date": "2026-07-25",
      "status": "present"
    }
  ]
}
```

Validaciones:

- La clase debe existir.
- El cuerpo debe ser un objeto JSON valido.
- `date` debe ser una fecha ISO valida.
- `attendance` debe ser un arreglo; puede estar vacio como operacion sin cambios.
- Cada alumna debe estar asignada a la clase.
- Cada estado debe pertenecer al conjunto permitido.
- Una alumna no puede repetirse dentro de la misma solicitud.
- La solicitud se valida completa antes de guardar cualquier entrada.

Errores:

- `400`: JSON, fecha, arreglo, alumna, estado o duplicado invalido.
- `404`: `classId` no identifica una clase.

## Idempotencia y actualizaciones parciales

La identidad de una asistencia es `(classId, date, studentId)`. Guardar de nuevo
la misma identidad reemplaza su estado; no crea otra asistencia. Repetir una
solicitud identica produce el mismo estado final.

El `POST` es parcial: las alumnas omitidas conservan su estado anterior. Con la
implementacion futura en PostgreSQL, todas las entradas de una solicitud deben
guardarse en una sola transaccion y conservar esta semantica de upsert.
