# Planes mensuales y pool de clases

Esta fase incorpora un catalogo configurable, asignacion mensual por alumna/o y
seguimiento de clases consumidas sin incluir pagos.

## Flujo de Patricia

1. Mantiene planes activos desde la seccion `Planes`; inicialmente existen los
   planes de 4 y 8 clases.
2. Configura primero los horarios habituales de la alumna/o.
3. En su ficha elige el mes, el plan y modalidad completa o proporcional.
4. Si es proporcional, selecciona la fecha de ingreso y revisa el cupo
   calculado a partir de las sesiones reales restantes.
5. En agenda marca exclusivamente `Presente` o `Ausente`.
6. Consulta en la ficha y la agenda el progreso, las clases restantes y las
   fechas que quedaron fuera del plan.

## Lectura del progreso

`Usadas` es la suma de presentes y ausentes dentro de las sesiones incluidas
cuya fecha ya llego. `Restantes` es `max(cupo - usadas, 0)`. Una sesion futura,
una sesion sin registrar o una sesion adicional fuera del plan no consume.

La base conserva el catalogo, el snapshot mensual y las sesiones que dieron
origen al calculo. Esa evidencia queda preparada para futuros indicadores de
suscripciones, presentismo, ausentismo, permanencia y estacionalidad.
