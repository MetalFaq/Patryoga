# Flujo diario de la administradora

## Objetivo

Resolver desde el teléfono la agenda, el padrón, los planes mensuales y la
asistencia del salón, con el menor uso posible de papel. Es un flujo interno;
no contempla todavía autogestión de alumnas/os ni pagos.

## Preparación del mes

1. Revisar que continúen activos los planes necesarios. El catálogo inicial
   incluye 4 y 8 clases y permite agregar otros límites.
2. Abrir la ficha de cada alumna/o y revisar sus horarios habituales.
3. Elegir el mes, plan y modalidad completa o proporcional.
4. Para un ingreso proporcional, indicar la fecha de comienzo y revisar el
   cupo calculado con las sesiones habituales restantes.
5. Confirmar el pool mensual. La ficha muestra sesiones incluidas, usadas,
   restantes y clases adicionales fuera del plan.

La asignación guarda un snapshot: editar después el plan o los horarios no
reescribe meses anteriores.

## Antes de una clase

1. Abrir Agenda y elegir Día, Semana o un Rango manual.
2. Ubicar la sesión. Las clases activas son de lunes a viernes; profesora y sala
   están fijadas por el sistema.
3. Revisar cupo, alumnas/os habituales y progreso del plan mensual.
4. Si hay un alta o cambio, buscar primero a la persona para evitar duplicados,
   actualizar su ficha y ajustar horarios.
5. Quitar un horario afecta sesiones futuras y conserva asistencia e historia.

## Registrar asistencia

1. Abrir la sesión de la fecha correcta.
2. Marcar a cada alumna/o como `Presente` o `Ausente`.
3. Se puede marcar a todas/os presentes y corregir excepciones.
4. Guardar explícitamente y esperar la confirmación.
5. Ante un error, conservar los cambios visibles, revisar la conexión y
   reintentar cuando la aplicación vuelva a estar saludable.

El estado interno `unmarked` significa que la sesión todavía no fue registrada;
no es una tercera opción que Patricia deba seleccionar. Dentro del pool, tanto
presente como ausente consume una clase cuando la fecha ya ocurrió.

## Cierre y correcciones

- Revisar sesiones pasadas que continúen sin registrar.
- Corregir llegadas tardías o errores abriendo la misma fecha; el nuevo estado
  reemplaza al anterior sin duplicarlo.
- Archivar una alumna/o cuando deja el salón. El reingreso conserva su identidad
  e historia, pero requiere elegir nuevamente horarios y un plan mensual.
- Eliminar una clase sin historia la borra; si tiene referencias históricas se
  retira de la agenda futura y conserva sus registros.

## Contingencia

Mientras continúe el piloto, el papel puede servir como respaldo si la
computadora, internet o Tailscale no están disponibles. No cargar simultáneamente
desde dos dispositivos la misma ficha o sesión: todavía no existe una alerta de
conflicto entre ediciones concurrentes.

La persona que opera el equipo sigue `docs/adoption-pilot-runbook.md` para
encendido, salud y recuperación. La app puede reemplazar el papel cuando
Patricia complete el período de adopción acordado sin pérdidas de datos.
