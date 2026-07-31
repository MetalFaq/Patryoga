# Contrato inicial de API

Este documento fija el contrato de la API integrada sobre PostgreSQL. Los datos
iniciales siguen siendo ficticios, pero los cambios son persistentes y deben
mantener este comportamiento salvo un cambio coordinado del contrato.

## Convenciones

- Fechas: texto ISO `YYYY-MM-DD`, tratado como fecha de calendario sin hora.
- Horas de clases: texto `HH:mm`.
- Respuestas y solicitudes: JSON con `Content-Type: application/json`.
- Errores: `{ "error": "descripcion" }` con un estado HTTP adecuado.
- Estados persistidos de asistencia: `present`, `absent` o `unmarked`.
- Los clientes solo pueden guardar `present` o `absent`; `unmarked` representa
  una sesion sin registrar y no es una opcion editable.
- `dataSource` es informativo durante la transicion desde mocks.
- Las plantillas activas solo admiten dias de lunes a viernes.
- La profesora y la sala son valores fijos del servidor: `Patricia` y
  `Sala unica`. Los clientes no deben solicitarlos ni enviarlos al crear o
  editar una clase.

## Autenticacion

Todos los endpoints de negocio bajo `/api/` requieren una sesion Auth.js de una
cuenta Google cuyo correo verificado coincide, sin distinguir mayusculas, con
alguna entrada de `AUTH_ALLOWED_EMAIL`. La variable contiene una lista separada
por comas; se ignoran los espacios alrededor de cada entrada. La autenticacion
queda cerrada si la lista esta vacia o contiene al menos una entrada invalida.
Las rutas internas `/api/auth/*` permanecen publicas para completar OAuth.

- `401`: no hay sesion o pertenece a otra cuenta.
- `503`: faltan credenciales, secreto, lista de correos permitidos o URL base
  en el entorno; ninguna operacion de negocio se ejecuta en este estado.

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

type MembershipPlan = {
  id: string;
  name: string;
  classLimit: number;
  description?: string;
  active: boolean;
};

type MonthlyPlanAssignment = {
  id: string;
  studentId: string;
  month: string;
  planId: string;
  planName: string;
  planDescription?: string;
  mode: "full" | "prorated";
  effectiveFrom: string;
  periodStart: string;
  periodEnd: string;
  classLimit: number;
  scheduledCount: number;
  usedCount: number;
  presentCount: number;
  absentCount: number;
  remainingCount: number;
  sessions: Array<{
    classId: string;
    date: string;
    position: number;
    included: boolean;
    status: "present" | "absent" | "unmarked";
  }>;
};
```

`saturday` solo puede aparecer al consultar historial heredado de una plantilla
ya inactiva. Las altas y ediciones aceptan exclusivamente `monday` a `friday`.

## `GET /api/classes`

Devuelve las sesiones de una semana.

La agenda contiene solo plantillas activas de lunes a viernes. Cada sesion
incluye exclusivamente las alumnas cuyo periodo de asignacion cubre la fecha de
esa sesion; un reingreso no vuelve a agregar horarios de periodos anteriores.

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

Devuelve un catalogo de alumnas separado por estado.

Consulta opcional:

- `status`: acepta exactamente `active` o `archived`. Si se omite, el valor
  predeterminado es `active`. El parametro no puede repetirse, ni siquiera con
  el mismo valor.

Respuesta `200`:

```json
{
  "dataSource": "runtime",
  "students": []
}
```

`status=active` contiene solamente alumnas activas y `status=archived`
solamente alumnas archivadas; no existe una vista combinada. Las alumnas
archivadas siguen en la base para preservar historial y solo aparecen cuando se
solicita ese estado de forma explicita.

Errores:

- `400`: `status` esta repetido, vacio o tiene un valor distinto de `active` o
  `archived`.

## Gestion de alumnas

### `POST /api/students`

Crea una alumna activa. Requiere `name` y `phone` no vacios; `notes` e `id` son
opcionales. Si no se envia `id`, el servidor genera uno.

- `201`: `{ "dataSource": "runtime", "student": Student }`.
- `400`: cuerpo o campos invalidos.
- `409`: el identificador ya existe.

### `PATCH /api/students/:studentId`

Actualiza de forma parcial `name`, `phone` o `notes`. Tambien acepta
`{ "active": true }` para reingresar una alumna archivada conservando su misma
identidad y todo su historial. El reingreso no reactiva asignaciones cerradas;
los nuevos horarios se asignan mediante
`POST /api/students/:studentId/classes`.

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
`durationMinutes` y `capacity`; `id` es opcional. `weekday` debe ser un dia de
lunes a viernes. El servidor completa `teacher: "Patricia"` y
`room: "Sala unica"`.

- `201`: `{ "dataSource": "runtime", "class": { ... } }`.
- `400`: cuerpo, horario, dia o campos numericos invalidos.
- `409`: el identificador ya existe o el horario se solapa con otra plantilla
  activa del mismo dia. El mensaje identifica la clase conflictiva.

### `PATCH /api/classes/:classId`

Actualiza al menos uno de `title`, `weekday`, `time`, `durationMinutes` o
`capacity`. `teacher` y `room` no son editables. Reducir el cupo por debajo de
las asignaciones activas o mover la plantilla a un horario solapado se rechaza
de forma transaccional sin aplicar cambios parciales.

- `200`: `{ "dataSource": "runtime", "message": "Class updated" }`.
- `400`: no hay campos editables o algun campo es invalido.
- `404`: la clase no existe.
- `409`: el nuevo cupo es menor que las asignaciones activas o el horario se
  solapa con otra plantilla activa. En este ultimo caso el mensaje identifica
  la clase conflictiva.

### `DELETE /api/classes/:classId`

Elimina la plantilla de la operacion habitual:

- si no tiene asistencias ni sesiones guardadas en un plan mensual, borra
  definitivamente la plantilla y sus asignaciones;
- si tiene al menos una asistencia o aparece en el snapshot de un plan mensual,
  la deja inactiva, cierra sus asignaciones vigentes y conserva la plantilla,
  las asignaciones, el pool y las asistencias necesarias para el historial.

- `204`: eliminacion o retiro de agenda aplicado.
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
- `409`: clase inactiva o cupo agotado.

Asignar otra vez una relacion que ya esta activa es idempotente. Cerrar una
relacion inexistente o ya cerrada no modifica historial. Asignar nuevamente una
relacion cerrada crea un periodo de vigencia nuevo; nunca reabre ni reescribe el
periodo anterior. Toda la operacion conserva atomicidad cuando incluye varias
clases. Si un periodo nuevo todavia no entro en vigencia, una baja inmediata lo
cancela sin alterar ningun periodo historico efectivo.

## Catalogo de planes mensuales

### `GET /api/plans`

Devuelve planes. La consulta opcional `status` acepta `active`, `inactive` o
`all`; el valor predeterminado es `active`.

- `200`: `{ "dataSource": "runtime", "plans": MembershipPlan[] }`.
- `400`: `status` invalido o repetido.

### `POST /api/plans`

Crea un plan. Requiere `name` no vacio y `classLimit` entero positivo;
`description` e `id` son opcionales. El servidor genera el identificador si no
se envia.

- `201`: `{ "dataSource": "runtime", "plan": MembershipPlan }`.
- `400`: cuerpo o campos invalidos.
- `409`: identificador o nombre activo duplicado.

### `PATCH /api/plans/:planId`

Actualiza al menos uno de `name`, `classLimit`, `description` o `active`. Los
cambios solo afectan asignaciones futuras porque cada asignacion mensual guarda
un snapshot del plan.

- `200`: `{ "dataSource": "runtime", "plan": MembershipPlan }`.
- `400`: cuerpo vacio o campos invalidos.
- `404`: plan inexistente.
- `409`: nombre activo duplicado.

Los planes iniciales son `Plan 4 clases` y `Plan 8 clases`. Un plan usado no se
borra: se desactiva y permanece disponible para historial.

## Asignaciones mensuales de planes

### `GET /api/plan-assignments`

Requiere `month=YYYY-MM`. Acepta opcionalmente un unico `studentId`. Devuelve
las asignaciones mensuales con sus sesiones snapshot y progreso calculado.

- `200`: `{ "dataSource": "runtime", "assignments": MonthlyPlanAssignment[] }`.
- `400`: mes o parametros invalidos.
- `404`: alumna/o inexistente cuando se solicita `studentId`.

### `PUT /api/plan-assignments/:studentId/:month`

Crea o reemplaza la asignacion unica de una alumna/o para el mes indicado.

Plan completo:

```json
{ "planId": "plan-8", "mode": "full" }
```

Plan proporcional:

```json
{
  "planId": "plan-8",
  "mode": "prorated",
  "effectiveFrom": "2026-08-17"
}
```

Reglas:

- El mes va desde su primer lunes a viernes hasta su ultimo lunes a viernes.
- No se descuentan feriados en esta primera version.
- `effectiveFrom` debe pertenecer al mes y no superar su ultimo dia habil.
- En modo completo, el cupo snapshot es el limite del plan y la vigencia inicia
  el primer dia habil.
- En modo proporcional, el cupo es el menor valor entre el limite del plan y
  las sesiones habituales disponibles desde `effectiveFrom`.
- Las sesiones se ordenan por fecha, hora e identificador. Las primeras hasta
  alcanzar el cupo quedan `included: true`; las adicionales quedan fuera.
- El calculo usa los horarios habituales vigentes y guarda las sesiones como
  snapshot. Cambiar horarios despues no reescribe el plan mensual.
- Presente y ausente consumen cupo solo cuando la fecha de la sesion es igual o
  anterior a la fecha actual. Una marca futura no consume hasta llegar el dia.
  `unmarked` no consume cupo.
- Reemplazar una asignacion con asistencias ya registradas para alguna de sus
  sesiones se rechaza para no reescribir historia.

Respuestas:

- `200`: `{ "dataSource": "runtime", "assignment": MonthlyPlanAssignment }`.
- `400`: cuerpo, mes, modalidad o fecha invalidos.
- `404`: alumna/o o plan inexistente.
- `409`: alumna/o archivado, plan inactivo, ausencia de sesiones habituales o
  intento de reemplazar un mes que ya tiene asistencias.

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
- El periodo de asignacion debe incluir la fecha indicada; una asignacion actual
  no autoriza a cargar asistencia en fechas anteriores a su alta.
- Solo se aceptan `present` y `absent`; `unmarked` se obtiene al no existir un
  registro y no puede guardarse desde la interfaz.
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

## Nota de validacion local

La prueba opcional de reinicializacion en `tests/management-api.test.mjs`
ejecuta `psql` con el usuario `yoga` y la base `yoga_salon`, mientras que la
configuracion Compose vigente usa `POSTGRES_USER=patryoga_app` y
`POSTGRES_DB=patryoga`. Esa comprobacion opcional puede fallar aunque el
contrato de la API sea correcto. La inconsistencia queda documentada y no se
corrige en esta tarea.
