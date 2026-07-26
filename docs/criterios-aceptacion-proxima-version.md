# Criterios de aceptación de la próxima versión

## P0 — operación diaria confiable

1. **Agenda móvil.** En una pantalla de 360 px de ancho, la administradora puede
   consultar la semana vigente, cambiar de semana y abrir una sesión sin
   desplazamiento horizontal ni controles superpuestos. Cada sesión habitual
   se genera en el día semanal de su plantilla.
2. **Datos de sesión.** Cada sesión muestra fecha, horario, docente, sala, cupo,
   alumnas asignadas y totales por estado. Una sesión nueva muestra `unmarked`
   salvo que exista asistencia guardada.
3. **Carga rápida.** Se puede marcar individualmente `present`, `absent` o
   `unmarked`, marcar a todas presentes y corregir excepciones antes de guardar.
4. **Guardado seguro.** El guardado es explícito, indica progreso y confirma el
   éxito. Si falla, informa el error, mantiene los cambios y permite reintentar.
   Una entrada inválida rechaza toda la solicitud.
5. **Reapertura e idempotencia.** Al reabrir la sesión aparecen los estados
   guardados. Repetir el mismo guardado no duplica asistencia y una corrección
   reemplaza el estado de `(classId, date, studentId)`.
6. **Persistencia.** Agenda, alumnas, asignaciones y asistencias sobreviven a un
   reinicio del servidor y conservan historial; los datos ficticios no son la
   fuente operativa del piloto.

## P1 — menos mantenimiento en papel

1. **Padrón.** Se puede buscar, crear y editar una alumna con nombre, teléfono y
   notas opcionales, manteniendo un identificador estable.
2. **Bajas sin pérdida.** Desactivar una alumna no borra asistencias anteriores;
   el reingreso respeta la decisión de producto sobre identidad y vigencia.
3. **Asignaciones.** Se puede incorporar o quitar una alumna de una clase
   habitual, sin duplicar el par activo y sin superar el cupo. El cambio no
   altera asistencias pasadas.
4. **Agenda semanal.** Se pueden mantener plantillas de lunes a sábado con día,
   hora, duración, docente, sala y cupo. Editarlas no elimina historia.

Estos criterios P1 requieren ampliar el contrato de API de forma coordinada;
este documento no define endpoints ni cambia los contratos vigentes.

## P2 — control operativo

1. Se identifican con claridad sesiones con alumnas pendientes.
2. Las correcciones de fechas pasadas usan el mismo flujo y muestran una
   confirmación inequívoca.
3. La conducta ante asistencia futura, sesiones excepcionales y auditoría se
   implementa solo después de resolver las decisiones pendientes.

## Fuera de alcance inmediato

Pagos, portal o acceso de alumnas, reservas autogestionadas, mensajes y otras
automatizaciones.
