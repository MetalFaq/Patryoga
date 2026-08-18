# Auditoría de dependencias — 17 de agosto de 2026

## Resultado final

- `npm audit`: 0 vulnerabilidades conocidas.
- `npm audit --omit=dev`: 0 vulnerabilidades productivas conocidas.
- Next.js se actualizó de 15.5.22 a 16.3.1 para retirar las alertas que
  alcanzaban la imagen productiva.
- No se usó `npm audit fix --force`.

## Hallazgos iniciales

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

## Control continuo

El workflow `.github/workflows/ci.yml` vuelve a ejecutar `npm audit` y bloquea
la validación ante vulnerabilidades altas o críticas. Un resultado limpio sólo
representa la base de avisos disponible en el momento de cada ejecución.
