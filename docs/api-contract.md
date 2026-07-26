# Contrato inicial de API

Este documento fija el contrato de la API integrada sobre PostgreSQL. Los datos
iniciales siguen siendo ficticios, pero los cambios son persistentes y deben
mantener este comportamiento salvo un cambio coordinado del contrato.

## Convenciones

- Fechas: texto ISO `YYYY-MM-DD`, tratado como fecha de calendario sin hora.
- Horas de clases: texto `HH:mm`.
- Respuestas y solicitudes: JSON con `Content-Type: application/json`.
- Errores: `{ "error": "descripcion" }` con un estado HTTP adecuado.
- Estados de asistencia: `present`, `absent` o `unmarked`.
- `dataSource` es informativo durante la transicion desde mocks.

## Autenticacion

Todos los endpoints de negocio bajo `/api/` requieren una sesion Auth.js de la
cuenta Google cuyo correo verificado coincide con `AUTH_ALLOWED_EMAIL`. Las
rutas internas `/api/auth/*` permanecen publicas para completar OAuth.

- `401`: no hay sesion o pertenece a otra cuenta.
- `503`: faltan credenciales, secreto, correo permitido o URL base en el
  entorno; ninguna operacion de negocio se ejecuta en este estado.

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
  "dataSource": "runtime",
  "students": []
}
```

La lista contiene solamente alumnas activas. Las alumnas archivadas siguen en
la base para preservar historial, pero no aparecen en este catalogo operativo.

## Gestion de alumnas

### `POST /api/students`

Crea una alumna activa. Requiere `name` y `phone` no vacios; `notes` e `id` son
opcionales. Si no se envia `id`, el servidor genera uno.

- `201`: `{ "dataSource": "runtime", "student": Student }`.
- `400`: cuerpo o campos invalidos.
- `409`: el identificador ya existe.

### `PATCH /api/students/:studentId`

Actualiza de forma parcial `name`, `phone` o `notes`.

- `200`: `{ "dataSource": "runtime", "student": Student }`.
- `400`: cuerpo o campos invalidos.
- `404`: la alumna no existe.

### `DELETE /api/students/:studentId`

Archiva la alumna sin borrar datos ni asistencias. Tambien cierra sus
asignaciones activas con la fecha actual.

- `204`: archivado aplicado de forma idempotente.
- `404`: la alumna no existe.

## Gestion de clases semanales

### `POST /api/classes`

Crea una plantilla semanal. Requiere `title`, `weekday`, `time`,
`durationMinutes`, `teacher`, `room` y `capacity`; `id` es opcional.

- `201`: `{ "dataSource": "runtime", "class": { ... } }`.
- `400`: cuerpo, horario, dia o campos numericos invalidos.
- `409`: el identificador ya existe.

### `PATCH /api/classes/:classId`

Actualiza al menos uno de los campos editables de la plantilla. Reducir el cupo
por debajo de las asignaciones activas se rechaza de forma transaccional.

- `200`: `{ "dataSource": "runtime", "message": "Class updated" }`.
- `400`: no hay campos editables o algun campo es invalido.
- `404`: la clase no existe.
- `409`: el nuevo cupo es menor que las asignaciones activas.

### `DELETE /api/classes/:classId`

Archiva la plantilla sin borrar asignaciones ni asistencias historicas.

- `204`: archivado aplicado de forma idempotente.
- `404`: la clase no existe.

## Gestion de asignaciones

`POST /api/students/:studentId/classes` asigna y
`DELETE /api/students/:studentId/classes` cierra asignaciones. Ambos reciben:

```json
{
  "classIds": ["class-lun-0830"]
}
```

La operacion completa es transaccional. El arreglo debe contener identificadores
unicos y no puede estar vacio.

- `200`: `{ "dataSource": "runtime", "message": "...", "classIds": [] }`.
- `400`: cuerpo o `classIds` invalidos.
- `404`: alumna inexistente/archivada o clase inexistente.
- `409`: clase archivada, cupo agotado o intento de reactivar una asignacion
  cerrada sin crear un nuevo periodo de vigencia.

Asignar otra vez una relacion que ya esta activa es idempotente. Cerrar una
relacion inexistente o ya cerrada no modifica historial. Hasta definir el modelo
de reingresos, una asignacion cerrada no se puede reactivar.

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
