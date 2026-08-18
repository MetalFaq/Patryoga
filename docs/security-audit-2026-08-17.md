# Auditoría de seguridad — 17 de agosto de 2026

## Resultado ejecutivo

No quedó un hallazgo P0 que impida el piloto. El callback de Tailscale está
registrado en Google y el inicio de sesión HTTPS real fue validado.

- `npm audit`: 0 vulnerabilidades conocidas.
- `npm audit --omit=dev`: 0 vulnerabilidades productivas conocidas.
- Funnel publica únicamente `/` hacia la aplicación en loopback.
- PostgreSQL no publica puertos al host.
- La aplicación ejecuta como usuario no privilegiado y sin modo `privileged`.
- La autenticación falla cerrado, exige `email_verified` y compara una allowlist.
- El repositorio público es intencional y tiene secret scanning y push
  protection habilitados.
- Firewall de Windows y Microsoft Defender están activos.

Este resultado no equivale a un pentest ni garantiza que no existan
vulnerabilidades todavía no publicadas.

## Primera fase de endurecimiento — 18 de agosto de 2026

La primera ola aplica controles de bajo riesgo y deja fuera, de forma
deliberada, los cambios de roles PostgreSQL, ACL, backups y rate limiting:

- `/api/health` es liveness de proceso, no consulta PostgreSQL y responde con
  `Cache-Control: no-store`;
- todas las respuestas incorporan HSTS, `nosniff`, anti-framing,
  Referrer-Policy y Permissions-Policy;
- la CSP comienza como `Content-Security-Policy-Report-Only` para observar
  incompatibilidades con Next.js y OAuth antes de hacerla obligatoria;
- los logs `json-file` de app, migraciones y base rotan a 10 MB y conservan
  tres archivos por contenedor;
- `app` elimina capabilities Linux y activa `no-new-privileges`; no se aplica
  filesystem de solo lectura hasta validar las escrituras necesarias del
  runtime.

El endpoint público no demuestra disponibilidad de PostgreSQL. La readiness de
base se comprueba con el healthcheck propio de `db`; no se agregó una nueva
ruta pública de diagnóstico.

## Hallazgos npm iniciales y resolución

La primera consulta detectó seis vulnerabilidades altas y ninguna crítica:

| Paquete | Alcance | Riesgo informado | Resolución |
| --- | --- | --- | --- |
| `next` | Producción, directa | Cadena afectada por alertas de `postcss` y `sharp` | Actualizado a 16.3.1 |
| `postcss` | Producción, transitiva | XSS y lectura de archivos mediante sourcemaps manipulados | Actualizado con Next.js |
| `sharp` | Producción, transitiva | Vulnerabilidades heredadas de libvips | Actualizado con Next.js |
| `nanoid` | Producción, transitiva | Bucle indefinido con generadores personalizados de tamaño cero | Actualizado transitivamente |
| `brace-expansion` | Desarrollo, transitiva | Denegación de servicio por expansión sin límite | Corregido con `npm audit fix` compatible |
| `js-yaml` | Desarrollo, transitiva | Consumo cuadrático de CPU al resolver `!!omap` | Corregido con `npm audit fix` compatible |

Referencias de los avisos reportados por npm:

- `brace-expansion`: GHSA-mh99-v99m-4gvg y GHSA-rgw5-rvv9-x895.
- `js-yaml`: GHSA-5p4m-2wfm-xmqj.
- `nanoid`: GHSA-2v37-7h3g-55p8.
- `postcss`: GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q,
  GHSA-fxqj-rqcc-2cmp y GHSA-r28c-9q8g-f849.
- `sharp`: GHSA-f88m-g3jw-g9cj.

Next.js se actualizó de 15.5.22 a 16.3.1. No se usó
`npm audit fix --force`. La imagen operacional quedó identificada mediante
etiquetas OCI de origen, versión, revisión y fecha.

## P1 — remediar durante el piloto

| Hallazgo | Riesgo | Recomendación |
| --- | --- | --- |
| No hay rate limiting | Tráfico abusivo puede consumir recursos o presionar login/API | Limitar por IP y ruta; evaluar protección perimetral antes de producción |
| `/api/health` era público y ejecutaba `SELECT 1` | Cada solicitud pública generaba trabajo contra PostgreSQL | **Resuelto en fase 1:** liveness barato sin acceso a DB; readiness queda en el healthcheck interno de `db` |
| El rol runtime de PostgreSQL es superusuario | Una inyección o compromiso de app tendría privilegios excesivos | Crear rol de aplicación sin superuser y rol separado para migraciones |
| ACL local de `.env` y backups demasiado amplia | Otros usuarios o procesos locales podrían leer secretos y datos | Restringir permisos al usuario operador y cuentas de servicio necesarias |
| Backups sólo locales y manuales | Falla o pérdida del equipo puede eliminar servicio y respaldo | Automatizar copia cifrada fuera del host, retención y restauraciones periódicas |
| Faltaban headers CSP, X-Frame-Options, HSTS, nosniff, Referrer-Policy y Permissions-Policy | Menor defensa del navegador frente a inyección, framing y fuga de contexto | **Parcialmente resuelto en fase 1:** headers activos y CSP Report-Only; falta observarla y decidir enforcement |
| Logs sin request IDs, métricas ni alertas | Diagnóstico tardío y poca correlación de incidentes | La rotación quedó resuelta en fase 1; agregar IDs, métricas de salud y alertas sin datos personales |
| Docker Desktop depende de la sesión Windows | Cerrar sesión o reiniciar puede dejar el servicio fuera de línea | Documentar recuperación y migrar a servicio/host dedicado después de adopción |
| No se escanearon CVE del sistema operativo de la imagen | `npm audit` no cubre Alpine, Node ni binarios nativos | Incorporar escaneo de imagen en CI y revisar el digest de la imagen base |

## P2 — defensa en profundidad o verificación pendiente

- Habilitar y comprobar branch protection y actualizaciones Dependabot.
- Fijar GitHub Actions por SHA e imágenes Docker por digest, con renovación
  planificada.
- Seguir la madurez de Auth.js beta, revisar duración/rotación de sesión y
  planificar una versión estable.
- `app` ya usa capabilities mínimas y `no-new-privileges`; evaluar filesystem
  de sólo lectura, límites de CPU/memoria y perfiles adicionales.
- Limitar tamaño de payload, definir timeouts y validar política de `Origin` en
  escrituras sensibles.
- Verificar BitLocker y las ACL/políticas de la tailnet; no se consideran
  controles confirmados todavía.

## OAuth y callbacks

- Conservar el callback de `localhost` para desarrollo.
- Mantener el callback estable de Tailscale mientras dure el piloto.
- Los callbacks antiguos de Quick Tunnel deben retirarse sólo después de
  confirmar que ninguna prueba o configuración activa todavía los usa.
- Cada origen nuevo requiere coincidencia exacta entre `AUTH_URL` y la URI de
  redireccionamiento autorizada en Google.

No guardar hostnames, correos permitidos, IDs del cliente ni secretos en este
documento.

## Control continuo

El workflow `.github/workflows/ci.yml` ejecuta `npm audit` y bloquea la
validación ante vulnerabilidades altas o críticas. Además:

1. revisar alertas y dependencias por lo menos una vez al mes;
2. escanear la imagen completa después de cada actualización de Node/Alpine;
3. comprobar acceso público, OAuth, firewall y puertos tras cambios de red;
4. verificar backups y restauraciones sin imprimir datos ni credenciales;
5. registrar remediaciones P1/P2 con evidencia y fecha.

Los riesgos operativos y el roadmap están en
`docs/pilot-risks-and-roadmap.md`.
