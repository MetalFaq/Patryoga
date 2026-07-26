# Flujo diario de la administradora

## Objetivo

Resolver desde el teléfono la agenda, el padrón y la asistencia del salón, con
el menor uso posible de papel. Es un flujo interno para una única administradora;
no contempla autogestión de alumnas.

## Antes de la primera clase

1. Abrir la agenda en la semana vigente y ubicar las sesiones del día.
2. Revisar horario, docente, sala, cupo y alumnas habituales de cada sesión.
3. Si hay un alta o cambio, buscar primero a la alumna para evitar duplicados,
   actualizar sus datos administrativos y ajustar su asignación habitual.
4. Antes de asignar, comprobar que el cupo no sea superado. Quitar una
   asignación solo debe afectar sesiones futuras y nunca borrar asistencias.

La consulta de agenda y alumnas ya está contemplada por el contrato. Las altas,
ediciones, bajas y cambios de plantillas o asignaciones requieren contratos
nuevos coordinados antes de implementarse.

## Durante cada clase

1. Abrir la sesión por fecha y `classId`.
2. Partir de los estados guardados; sin registro previo, cada alumna aparece
   como `unmarked` (pendiente).
3. Marcar `present` o `absent`. Se puede marcar a todas como presentes y luego
   corregir excepciones.
4. Revisar los totales de presentes, ausentes y pendientes.
5. Guardar explícitamente. Se pueden enviar solo los cambios de alumnas
   asignadas y una solicitud inválida no debe guardar ninguna entrada.
6. Ante un error, conservar los cambios visibles y permitir reintentar. Al
   confirmar, volver a abrir la sesión debe mostrar el estado guardado.

## Cierre y correcciones

- Antes de cerrar la clase, revisar los pendientes; `unmarked` sigue siendo un
  estado válido y no debe convertirse automáticamente en ausencia.
- Registrar llegadas tardías o corregir errores en la misma sesión.
- Consultar una fecha pasada y corregirla con el mismo flujo. Guardar otra vez
  la misma alumna, clase y fecha reemplaza su estado sin duplicar registros.
- Usar teléfono y notas solo como información administrativa; no forman parte
  del registro de asistencia.

Mientras continúe el piloto, el papel sirve únicamente como respaldo de
contingencia. La app puede reemplazarlo cuando la persistencia sobreviva a
reinicios y el salón complete un período de uso paralelo sin pérdida de datos.
