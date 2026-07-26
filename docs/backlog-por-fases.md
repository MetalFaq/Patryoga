# Backlog funcional por fases

## Fase 0 — preparar el piloto

- Validar en teléfono la agenda semanal y la carga de asistencia existente.
- Reemplazar semanas fijas y datos ficticios por fechas y datos operativos.
- Asegurar persistencia transaccional e idempotente, incluida la recuperación
  después de reiniciar el servidor.
- Mantener el papel como respaldo y acordar cómo conciliar diferencias.

**Salida:** se puede completar una clase en la app sin pérdida de datos, pero el
papel continúa como respaldo.

## Fase 1 — operar asistencia desde el móvil

- Priorizar la agenda del día y el acceso rápido a cada sesión.
- Marcar en bloque, corregir excepciones y guardar con estados claros de
  progreso, éxito y error.
- Reabrir y corregir fechas pasadas sin duplicar registros.
- Detectar pendientes y verificar el cierre diario.

**Salida:** tras el período paralelo acordado, la app pasa a ser la fuente de
asistencia y el papel queda solo para contingencias.

## Fase 2 — gestionar padrón y agenda

- Incorporar búsqueda, alta, edición, desactivación y reingreso de alumnas.
- Gestionar asignaciones habituales con unicidad, vigencia y control de cupo.
- Crear y editar plantillas semanales sin borrar historial.
- Definir primero los contratos de escritura y las decisiones de vigencia.

**Salida:** las tareas habituales de agenda y padrón ya no requieren planillas.

## Fase 3 — trazabilidad y excepciones

- Aplicar la política definida para fechas futuras y sesiones excepcionales.
- Agregar auditoría de correcciones si producto la considera necesaria.
- Mejorar la contingencia sin introducir automatizaciones fuera de alcance.

**Salida:** el salón puede investigar correcciones y manejar excepciones con
reglas explícitas.

## No planificado como alcance inmediato

Pagos, portal de alumnas, reservas públicas, comunicaciones automáticas e
integraciones externas.
