# Backlog funcional por fases

## Fases técnicas completadas

- Interfaz móvil para Agenda, Alumnas/os, Clases y Planes.
- PostgreSQL transaccional con historial, restricciones y migraciones
  versionadas.
- Autenticación Google con lista de cuentas autorizadas.
- Clases de lunes a viernes, sin solapamientos, con profesora y sala fijas.
- Archivo/reingreso de alumnas/os y vigencias de horarios.
- Planes mensuales completos o proporcionales, con catálogo inicial de 4 y 8
  clases y snapshots históricos.
- CI, auditoría de dependencias, imagen identificable, backup restaurado y
  publicación gratuita mediante Tailscale Funnel.
- Base operacional limpia para iniciar la adopción.

## Fase actual — adopción acompañada

- Patricia usa datos reales para agenda, padrón, planes y asistencia.
- Se mantiene el papel sólo como contingencia durante el período acordado.
- Se realiza una entrevista guiada y se registran tareas confusas, bloqueos e
  incidentes.
- Se priorizan correcciones por frecuencia, impacto y riesgo de datos.
- Se revisa semanalmente salud, backups y disponibilidad del equipo.

**Salida:** Patricia decide continuar y completa el trabajo habitual sin ayuda
técnica ni pérdida de datos.

## Próxima fase — confiabilidad operativa

- Automatizar backups cifrados fuera del equipo y ensayar restauraciones.
- Incorporar logs estructurados, IDs de solicitud, métricas y alertas.
- Agregar rate limiting y auditoría de cambios administrativos.
- Resolver conflictos de edición simultánea.
- Definir política para fechas futuras, sesiones excepcionales y cierre de
  clases sin registrar.

**Salida:** el servicio puede operarse y recuperarse con procedimientos medidos.

## Fase futura — publicación productiva

- Elegir Raspberry Pi/equipo dedicado o proveedor cloud.
- Definir presupuesto, disponibilidad y responsable de operación.
- Registrar dominio y configurar DNS, HTTPS y callback OAuth definitivo.
- Migrar la base mediante backup restaurable y migraciones versionadas.
- Ejecutar smoke tests y mantener rollback hasta la aceptación.

**Salida:** el piloto deja de depender de la computadora personal.

## Evoluciones de producto posteriores

- Pagos y vencimientos.
- Indicadores de presentismo, ausentismo, permanencia y estacionalidad.
- Portal o reservas para alumnas/os.
- Mensajería y recordatorios.
- Sesiones extraordinarias y feriados.

Ninguna de estas evoluciones debe comprometer los snapshots mensuales ni el
historial ya guardado.
