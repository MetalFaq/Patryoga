# Reglas iniciales de dominio

## Clases fijas semanales

- Una clase semanal es una plantilla recurrente con dia, hora, duracion y
  capacidad. La docente y la sala son unicas y fijas: `Patricia` y
  `Sala unica`.
- La identidad de la plantilla es `classId` y no cambia entre semanas.
- Una sesion concreta se identifica por `(classId, date)`.
- La agenda semanal genera cada sesion en el dia configurado por su plantilla.
- Las plantillas activas solo pueden configurarse de lunes a viernes. Los datos
  heredados de sabados se mantienen inactivos si hacen falta para el historial.
- Como hay una sola sala y una sola docente, dos plantillas activas del mismo
  dia no pueden solaparse. Dos intervalos que solo se tocan en el limite no se
  consideran solapados.
- La comprobacion de solapamiento de altas y ediciones se serializa dentro de
  la transaccion para impedir que solicitudes concurrentes creen conflictos.
- Eliminar una plantilla sin asistencias la borra definitivamente junto con sus
  asignaciones. Si tiene asistencias, se la retira de agendas futuras, se
  cierran sus asignaciones activas y se conserva el historial.
- Cambiar una plantilla no debe borrar asistencias historicas.

## Alumnas

- Cada alumna tiene un identificador estable, nombre y telefono.
- Las notas son opcionales y administrativas; no forman parte de la asistencia.
- Archivar una alumna la quita del catalogo operativo, cierra sus asignaciones
  activas y no borra sus registros historicos.
- Reingresar una alumna reactiva la misma identidad, pero no vuelve a activar
  ninguno de sus horarios anteriores. Los horarios del nuevo ingreso se eligen
  de forma explicita.

## Asignaciones habituales

- Una asignacion vincula una alumna con una clase semanal habitual.
- Cada asignacion tiene un periodo inclusivo delimitado por `active_from` y
  `active_until`. Un periodo que ya entro en vigencia no se elimina ni se
  reescribe; uno pendiente puede cancelarse antes de comenzar.
- El par `(classId, studentId)` debe tener como maximo un periodo activo.
- La cantidad de asignaciones activas no debe superar la capacidad de la clase.
- Una asignacion no equivale a presencia: cada sesion comienza como `unmarked`
  salvo que exista un registro guardado.
- Quitar una asignacion afecta sesiones futuras, pero no debe alterar asistencias
  pasadas. Los periodos ya vigentes se cierran con `active_until`; solo se
  elimina un periodo pendiente que nunca llego a comenzar.
- Asignar otra vez una relacion activa es idempotente.
- Asignar de nuevo una relacion cerrada crea un periodo de vigencia nuevo. El
  periodo anterior sigue disponible para resolver agenda y asistencia pasada.
- Altas, bajas y cambios de cupo se validan dentro de transacciones. El bloqueo
  de la clase serializa el control de capacidad para asignaciones concurrentes.

## Asistencias

- La identidad es `(classId, date, studentId)` y debe ser unica.
- Los estados permitidos son `present`, `absent` y `unmarked`.
- La administradora puede crear o corregir asistencias de fechas pasadas.
- No hay una restriccion inicial para fechas futuras; cualquier fecha ISO valida
  es aceptada hasta que producto defina otra regla.
- Solo una alumna asignada a la clase puede recibir asistencia mediante el
  contrato actual. Su periodo de asignacion debe cubrir la fecha de la sesion.
- Una actualizacion parcial no cambia a las alumnas omitidas.
- Repetir el mismo guardado es idempotente. Un estado nuevo para la misma
  identidad reemplaza al anterior; inicialmente rige "ultima escritura gana".
- Una solicitud con cualquier entrada invalida se rechaza completa y no debe
  aplicar cambios parciales.

## Historial y persistencia

- Las correcciones historicas son operaciones normales, no excepciones.
- PostgreSQL conserva los cambios al reiniciar la aplicacion.
- PostgreSQL aplica claves unicas, vigencias y transacciones para mantener las
  reglas anteriores. Ninguna baja o eliminacion borra asistencias guardadas.
- Las migraciones, autenticacion, auditoria de cambios y politicas de borrado se
  definiran en tareas posteriores.

## Decisiones pendientes de producto

- Si se permiten sesiones excepcionales en un dia diferente al de la plantilla.
- Si se bloquean o advierten asistencias futuras.
- Si cada correccion de asistencia necesita usuario, motivo y marca temporal.
