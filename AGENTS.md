# App Patryoga - reglas para agentes

## Propiedad de archivos

- Integrador: `package.json`, `package-lock.json`, `README.md`, `Dockerfile`,
  `.dockerignore`, `docker-compose.yml`, `.env.example` y tipos compartidos en
  `src/lib/types.ts`.
- Backend: `src/app/api/**`, `src/lib/db.ts`, `src/server/**` y `db/**`.
- Frontend: `src/app/page.tsx`, `src/components/**` y `src/app/globals.css`.
- Calidad: `tests/**` y archivos nuevos de pruebas. Cualquier cambio de scripts
  o dependencias debe solicitarse al integrador.
- Producto y dominio: `docs/**`. Los cambios de contrato deben coordinarse con
  backend, frontend e integrador antes de modificar codigo compartido.

## Reglas de trabajo

- Un solo agente escribe cada archivo durante una tarea. Usar ramas o worktrees
  separados para implementaciones paralelas.
- Limitar cada cambio al alcance asignado. No revertir ni reescribir cambios de
  otros agentes.
- Leer `docs/api-contract.md` y `docs/domain-rules.md` antes de cambiar API,
  persistencia, modelos o flujos de asistencia.
- No publicar remotos, secretos ni datos reales. No ampliar autenticacion,
  infraestructura o persistencia sin una tarea explicita.
- El integrador resuelve conflictos y modifica archivos compartidos.

## Validacion minima

Ejecutar, segun el alcance:

```bash
npm run typecheck
npm run lint
npm run build
```

Los cambios de API deben validar tambien casos correctos y errores esperados.
Informar comandos ejecutados, resultados y cualquier validacion omitida.
