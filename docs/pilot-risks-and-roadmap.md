# Riesgos del piloto y roadmap post-adopción

## Alcance del piloto

La etapa actual busca comprobar adopción y utilidad real con el menor costo
operativo. La aplicación corre en la computadora personal, usa Docker Desktop,
PostgreSQL local, Google OAuth y Tailscale Funnel. Esta solución es apropiada
para validar el producto, no representa aún una plataforma con disponibilidad
garantizada.

## Riesgos y controles actuales

| Riesgo | Impacto | Control actual | Pendiente antes de producción |
| --- | --- | --- | --- |
| Corte de luz, internet, reinicio o suspensión | La app queda fuera de servicio | Equipo conectado, sin suspensión/hibernación y verificación diaria | Host dedicado o nube, alertas y recuperación automática |
| URL pública descubierta o tráfico abusivo | Consumo de CPU, memoria o ancho de banda | OAuth, API protegida, health sin DB, headers defensivos, Funnel y rate limiting por proceso | WAF, métricas, alertas y limiter compartido si existen múltiples réplicas |
| Cuenta Google autorizada comprometida | Acceso administrativo a datos | Correo verificado y lista explícita | MFA obligatorio, revisión de accesos y auditoría administrativa |
| Compromiso de Windows o Docker | Exposición de `.env`, base y backups | Sesión bloqueada, DB sin puerto, contenedor no root y ACL de `.env` restringida | Corregir ACL de backups con elevación; host dedicado, parches y cifrado |
| Fallo o pérdida del disco local | Pérdida de datos desde el último respaldo externo | Backup lógico validado localmente | Backups automáticos cifrados fuera del equipo y pruebas de restauración |
| Escrituras simultáneas | Una edición posterior puede reemplazar otra | Transacciones, constraints e idempotencia del backend | Control de versión/optimistic locking y registro de cambios |
| Dependencia de Google o Tailscale | Login o acceso público indisponible | Salud local independiente y procedimientos de diagnóstico | Dominio propio, estrategia de contingencia y monitoreo externo |
| Vulnerabilidades nuevas | Riesgo aun con auditoría actual limpia | CI bloquea avisos altos/críticos; app sin capabilities y con `no-new-privileges` | Actualización programada, escaneo de imagen y revisión periódica |
| Datos personales en logs o respaldos | Exposición de información del salón | DB privada y backups fuera de Git | Retención, cifrado, acceso acotado y política de incidentes |

Un resultado de `npm audit` con cero hallazgos no equivale a una auditoría
integral, pentest ni garantía frente a vulnerabilidades todavía no publicadas.

## Estado de seguridad del piloto

El acceso HTTPS con Google fue probado correctamente. La aplicación falla
cerrado, exige correo verificado y allowlist; Funnel sólo reenvía la web local,
PostgreSQL no está publicado, el contenedor de la app no es privilegiado y
Windows mantiene firewall y Defender activos. Por lo tanto, OAuth no es un
bloqueante P0 del piloto.

La primera fase incorporó headers de navegador, CSP Report-Only, liveness sin
consultas a PostgreSQL, rotación de logs y hardening básico del contenedor de la
app. La segunda fase separó el rol runtime de PostgreSQL, agregó rate limiting
por proceso, restringió la ACL de `.env` y validó la imagen `0.1.2`, salud,
autenticación y headers. El backup previo se restauró por completo en una base
temporal y sus conteos coincidieron.

Las prioridades P1 restantes son corregir la ACL de la carpeta de backups con
elevación administrativa, automatizar copias cifradas externas, completar
observabilidad y escanear la imagen completa. También debe resolverse la
dependencia de Docker Desktop respecto de la sesión Windows. El destino del
backup externo todavía no fue elegido.

Como defensa en profundidad quedan branch protection/Dependabot, pines por
SHA/digest, seguimiento de Auth.js beta y sesiones, hardening adicional de
contenedores, límites de payload/timeout/Origin y la verificación de BitLocker y
políticas de la tailnet. El detalle y la evidencia se mantienen en
`docs/security-audit-2026-08-17.md`.

## Señales de adopción a registrar

Durante el piloto conviene anotar, sin agregar telemetría invasiva:

- cantidad de semanas de uso continuo;
- clases registradas sin volver al papel;
- errores o pérdidas de conectividad;
- tareas que Patricia no puede completar sin ayuda;
- correcciones de asistencia y datos duplicados;
- tiempo requerido para arrancar, verificar y respaldar;
- mejoras solicitadas y frecuencia con que bloquean el trabajo.

## Criterios para pasar a producción

La inversión en dominio y alojamiento definitivo tiene sentido cuando:

1. Patricia completa un período acordado de uso real y decide continuar.
2. Los flujos de agenda, asistencia, alumnas/os y planes están aceptados.
3. No hay pérdidas de datos y la restauración se ensayó recientemente.
4. Se definieron presupuesto, disponibilidad esperada y responsable operativo.
5. Se eligió entre un host dedicado doméstico y un proveedor cloud.
6. Se aprobaron dominio, política de backups, monitoreo y respuesta a incidentes.

## Roadmap recomendado

### 1. Consolidar adopción

- Entrevistar a Patricia con tareas concretas.
- Priorizar correcciones de usabilidad y reglas de negocio.
- Definir el período durante el cual el papel seguirá como contingencia.
- Registrar incidentes y costo operativo del piloto.

### 2. Endurecer operación

- Automatizar backups cifrados con retención y copia fuera del equipo.
- Corregir con UAC/administrador la ACL de la carpeta de backups; la de `.env`
  ya está restringida.
- Mantener separados los roles PostgreSQL de migración y runtime, y ejecutar
  provisionamiento después de futuras tablas o secuencias.
- Incorporar logs estructurados, IDs de solicitud, métricas y alertas; la
  rotación básica ya está aplicada.
- Mantener el rate limiting actual para una sola instancia y migrarlo a un
  almacén compartido si se despliegan múltiples réplicas.
- Agregar auditoría administrativa; los headers defensivos ya están aplicados
  y la CSP debe observarse antes de exigirla.
- Mantener health público como liveness y readiness de DB en su healthcheck
  interno.
- Escanear dependencias npm e imagen completa en CI.
- Establecer actualización mensual de dependencias e imagen base.

**Completado en fase 2:** privilegios runtime mínimos, límites separados
Auth/API, ACL de `.env`, backup/restore previo, imagen `0.1.2` y verificación
pública 5/5. **Pendiente:** ACL de backups, destino cifrado externo,
observabilidad, escaneo de imagen y operación sin dependencia de sesión.

### 3. Elegir alojamiento

- **Raspberry Pi u otro equipo dedicado:** costo mensual bajo y control local;
  requiere energía, internet, almacenamiento confiable y mantenimiento propio.
- **Servicio cloud con contenedores:** mayor disponibilidad y despliegue más
  simple; requiere presupuesto y una base PostgreSQL administrada o persistente.

La elección del host no obliga a elegir un dominio específico. Puede probarse
primero con el hostname del proveedor y conectar un dominio propio después.

### 4. Incorporar dominio y acceso permanente

- Registrar un dominio bajo una cuenta controlada por el proyecto.
- Publicar un subdominio estable, por ejemplo `app.<dominio>`.
- Configurar DNS/proxy, HTTPS y el callback exacto de Google.
- Actualizar `AUTH_URL`, recrear sólo la app y validar teléfono/escritorio.
- Mantener el Funnel actual únicamente como contingencia durante el corte.
- Retirar callbacks viejos de Quick Tunnel después de confirmar que ya no se
  usan; conservar `localhost` para desarrollo.

### 5. Migrar datos y cortar servicio

- Congelar escrituras durante una ventana acordada.
- Crear y restaurar un backup final en el destino.
- Aplicar migraciones versionadas y comprobar conteos e integridad.
- Ejecutar smoke tests autenticados y verificar monitoreo/rollback.
- Reabrir escrituras y retirar el piloto sólo después de aceptación.

## No decidido todavía

- Raspberry Pi versus proveedor cloud.
- Dominio, registrador y presupuesto anual.
- Objetivos de disponibilidad y tiempo máximo de recuperación.
- Proveedor de backups externos y período de retención.
- WAF, rate limiting distribuido, métricas y alertas concretas.

Estas decisiones quedan deliberadamente posteriores a la adopción; no bloquean
el piloto actual.
