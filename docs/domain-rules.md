# Reglas iniciales de dominio

## Clases fijas semanales

- Una clase semanal es una plantilla recurrente con dia, hora, duracion,
  docente, sala y capacidad.
- La identidad de la plantilla es `classId` y no cambia entre semanas.
- Una sesion concreta se identifica por `(classId, date)`.
- La agenda semanal genera cada sesion en el dia configurado por su plantilla.
- Archivar una plantilla la quita de agendas nuevas sin borrar asignaciones ni
  asistencias historicas.
- Cambiar una plantilla no debe borrar asistencias historicas.

## Alumnas

- Cada alumna tiene un identificador estable, nombre y telefono.
- Las notas son opcionales y administrativas; no forman parte de la asistencia.
- Archivar una alumna la quita del catalogo operativo, cierra sus asignaciones
  activas y no borra sus registros historicos.

## Asignaciones habituales

- Una asignacion vincula una alumna con una clase semanal habitual.
- El par `(classId, studentId)` debe ser unico mientras la asignacion este activa.
- La cantidad de asignaciones activas no debe superar la capacidad de la clase.
- Una asignacion no equivale a presencia: cada sesion comienza como `unmarked`
  salvo que exista un registro guardado.
- Quitar una asignacion afecta sesiones futuras, pero no debe alterar asistencias
  pasadas. El cierre registra `active_until` y no elimina la fila.
- Asignar otra vez una relacion activa es idempotente.
- Reactivar una asignacion cerrada se rechaza hasta definir un modelo con
  multiples periodos de vigencia; no se borra ni reescribe el periodo anterior.
- Altas, bajas y cambios de cupo se validan dentro de transacciones. El bloqueo
  de la clase serializa el control de capacidad para asignaciones concurrentes.

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
- PostgreSQL conserva los cambios al reiniciar la aplicacion.
- PostgreSQL aplica claves unicas y transacciones para mantener las reglas
  anteriores. Archivar entidades nunca elimina asistencias.
- Las migraciones, autenticacion, auditoria de cambios y politicas de borrado se
  definiran en tareas posteriores.

## Decisiones pendientes de producto

- Si se permiten sesiones excepcionales en un dia diferente al de la plantilla.
- Si se bloquean o advierten asistencias futuras.
- Como representar bajas y reingresos de alumnas y asignaciones.
- Si cada correccion de asistencia necesita usuario, motivo y marca temporal.
