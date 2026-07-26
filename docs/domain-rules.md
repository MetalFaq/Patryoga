# Reglas iniciales de dominio

## Clases fijas semanales

- Una clase semanal es una plantilla recurrente con dia, hora, duracion,
  docente, sala y capacidad.
- La identidad de la plantilla es `classId` y no cambia entre semanas.
- Una sesion concreta se identifica por `(classId, date)`.
- Como regla objetivo, la fecha de una sesion debe coincidir con el dia semanal
  de su plantilla. La API mock todavia no aplica esta validacion.
- Cambiar una plantilla no debe borrar asistencias historicas.

## Alumnas

- Cada alumna tiene un identificador estable, nombre y telefono.
- Las notas son opcionales y administrativas; no forman parte de la asistencia.
- Eliminar o desactivar una alumna no debe borrar sus registros historicos.

## Asignaciones habituales

- Una asignacion vincula una alumna con una clase semanal habitual.
- El par `(classId, studentId)` debe ser unico mientras la asignacion este activa.
- La cantidad de asignaciones activas no debe superar la capacidad de la clase.
- Una asignacion no equivale a presencia: cada sesion comienza como `unmarked`
  salvo que exista un registro guardado.
- Quitar una asignacion afecta sesiones futuras, pero no debe alterar asistencias
  pasadas. El modelo persistente debe conservar historial o vigencia de la
  asignacion antes de habilitar bajas reales.

## Asistencias

- La identidad es `(classId, date, studentId)` y debe ser unica.
- Los estados permitidos son `present`, `absent` y `unmarked`.
- La administradora puede crear o corregir asistencias de fechas pasadas.
- No hay una restriccion inicial para fechas futuras; cualquier fecha ISO valida
  es aceptada hasta que producto defina otra regla.
- Solo una alumna asignada a la clase puede recibir asistencia mediante el
  contrato actual.
- Una actualizacion parcial no cambia a las alumnas omitidas.
- Repetir el mismo guardado es idempotente. Un estado nuevo para la misma
  identidad reemplaza al anterior; inicialmente rige "ultima escritura gana".
- Una solicitud con cualquier entrada invalida se rechaza completa y no debe
  aplicar cambios parciales.

## Historial y persistencia

- Las correcciones historicas son operaciones normales, no excepciones.
- Reiniciar el servidor borra actualmente los cambios en memoria. Esta es una
  limitacion temporal, no una regla de negocio.
- PostgreSQL debe aplicar claves unicas y transacciones que mantengan las reglas
  anteriores.
- Las migraciones, autenticacion, auditoria de cambios y politicas de borrado se
  definiran en tareas posteriores.

## Decisiones pendientes de producto

- Si se permiten sesiones excepcionales en un dia diferente al de la plantilla.
- Si se bloquean o advierten asistencias futuras.
- Como representar bajas y reingresos de alumnas y asignaciones.
- Si cada correccion de asistencia necesita usuario, motivo y marca temporal.
