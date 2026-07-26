# Decisiones de producto pendientes

Resolver estas decisiones antes de ampliar contratos o persistencia. El orden
refleja su impacto sobre la próxima versión.

## Bloqueantes para gestión

1. **Vigencia de cambios de agenda.** Definir desde qué fecha rige una edición
   de plantilla y qué datos conserva una sesión histórica.
2. **Bajas y reingresos.** Decidir si se reactiva la misma alumna y asignación o
   se crea una nueva vigencia, siempre preservando historial e identificadores.
3. **Detección de duplicados.** Elegir si teléfono, nombre u otra combinación
   solo advierte o impide crear una alumna repetida.
4. **Cambios sin guardar.** Definir si al cambiar de sesión o semana se bloquea
   la navegación, se pide confirmación o se conservan borradores locales.

## Antes de extender asistencia

5. **Fechas futuras.** Mantenerlas permitidas, mostrar una advertencia o
   bloquearlas. Hoy cualquier fecha ISO válida está permitida.
6. **Sesiones excepcionales.** Definir si una sesión puede ocurrir en un día
   distinto al de su plantilla y cómo afecta cupo y asignaciones.
7. **Auditoría de correcciones.** Decidir si se registra responsable, fecha,
   motivo y estado anterior. Por ahora rige “última escritura gana”.
8. **Criterio de clase cerrada.** Determinar si quedan pendientes permitidos o
   si solo se advierten; `unmarked` debe continuar como estado válido.

## Antes de abandonar el papel

9. **Duración del piloto paralelo.** Acordar cantidad de semanas y responsable
   de conciliar diferencias entre app y planilla.
10. **Contingencia.** Definir cómo registrar temporalmente la asistencia si no
    hay conexión y cómo recuperarla sin duplicados.

No son decisiones de esta etapa: cobros, portal de alumnas, reservas públicas,
mensajería ni automatizaciones.
