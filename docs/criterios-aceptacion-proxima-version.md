# Criterios de aceptación del piloto

## P0 — operación diaria confiable

1. **Acceso móvil.** Desde teléfono y escritorio, una cuenta Google autorizada
   puede iniciar sesión por el origen HTTPS del piloto. Una cuenta anónima o no
   autorizada no accede a páginas ni API de negocio.
2. **Agenda.** La administradora puede consultar Día, Semana o un Rango manual,
   abrir sesiones y trabajar sin desplazamiento horizontal en 360 px.
3. **Asistencia.** La interfaz ofrece únicamente Presente y Ausente. El guardado
   es explícito, atómico e idempotente; una corrección reemplaza el estado
   anterior sin duplicarlo.
4. **Persistencia.** Alumnas/os, clases, horarios, asistencias y planes
   sobreviven al reinicio de la aplicación y conservan historial.
5. **Salud.** `db` y `app` quedan saludables después de `docker compose up -d`,
   las migraciones terminan correctamente y `/api/health` responde `status: ok`.
6. **Contingencia.** Existe un backup restaurable validado y no se requiere
   borrar el volumen para recuperar la aplicación.

## P1 — gestión del salón

1. **Padrón.** Se puede buscar, crear y editar una alumna/o con nombre, teléfono
   y notas opcionales, manteniendo un identificador interno estable.
2. **Bajas y reingresos.** Archivar conserva asistencias e historia. Reingresar
   conserva la identidad, pero no reactiva horarios anteriores.
3. **Horarios.** Se pueden agregar o quitar asignaciones habituales sin superar
   el cupo, duplicar una relación activa ni modificar asistencia pasada.
4. **Clases.** Las plantillas activas se crean de lunes a viernes, sin campos de
   profesora o sala, y no pueden solaparse. La eliminación preserva historia
   cuando existen referencias.
5. **Planes mensuales.** Existen planes de 4 y 8 clases, se pueden crear otros y
   asignar modalidad completa o proporcional con snapshot mensual.
6. **Consumo.** Presente y Ausente consumen una clase incluida cuando la fecha
   ya ocurrió; una sesión futura, no registrada o fuera del pool no consume.

## P2 — adopción y operación

1. Patricia puede completar las tareas anteriores sin ayuda técnica durante el
   período acordado.
2. Windows puede permanecer bloqueado con la pantalla apagada, pero no entra en
   suspensión ni hibernación mientras presta servicio conectado a corriente.
3. La persona operadora puede comprobar Docker, salud y Funnel con el runbook
   sin reiniciar PostgreSQL ni exponer secretos.
4. Los incidentes, dudas y mejoras se registran para decidir si se avanza a
   dominio y alojamiento definitivos.

## Fuera de alcance inmediato

Pagos, portal o acceso de alumnas/os, reservas autogestionadas, mensajería,
disponibilidad garantizada, dominio propio y alojamiento cloud definitivo.
