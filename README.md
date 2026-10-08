# Planet Producciones — Cotizador VIP 2026

Monorepo del sistema de cotizaciones de **Planet Producciones**. Contiene el
frontend (`apps/web`) y el backend (`apps/server`) como workspaces
independientes, además de configuración compartida en `packages/`.

## Estructura

```
.
├── .devcontainer/        # Configuración de Dev Container
├── .github/workflows/    # CI
├── apps/
│   ├── server/            # API Express (TypeScript) — cálculo, PDF, Excel, envío de correo
│   │   └── src/index.ts
│   └── web/                # Frontend estático (Vite + TypeScript)
│       └── src/main.ts
├── packages/
│   └── config/            # tsconfig base compartido
├── docker-compose.yml
├── bts.jsonc / bts.lock.json
└── package.json           # workspaces raíz
```

## Requisitos

- Node.js >= 18
- npm >= 9

## Instalación

```bash
npm install
```

Esto instala las dependencias de todos los workspaces (`apps/server`,
`apps/web`, `packages/config`).

## Desarrollo

```bash
# Backend (http://localhost:3000)
npm run dev:server

# Frontend (Vite dev server)
npm run dev:web

# Ambos a la vez
npm run dev
```

Abrir la app en http://localhost:5173 (Vite). El navegador no ejecuta
TypeScript directamente, por eso `apps/web/index.html` no funciona abierto
con doble clic ni con Live Server sin compilar.

## Build de producción

```bash
npm run build
npm start
```

Tras el build, el servidor sirve también el frontend compilado en
http://localhost:3000.

### Live Server (VS Code)

`.vscode/settings.json` apunta Live Server a `apps/web/dist`. Ejecuta
`npm run build:web` antes de pulsar "Go Live".

## Variables de entorno

Copia `apps/server/.env.example` a `apps/server/.env` y completa los valores
reales (usuario/clave SMTP, puerto y los correos de la empresa que reciben las
cotizaciones: `EMAIL_SECRETARIA`, `EMAIL_JEFE` y `EMAIL_ADMINISTRADOR`).

## Docker

```bash
docker compose up --build
```

Levanta el backend en `:3000` y el frontend (servido por Nginx) en `:8080`.

## Funcionalidad

El sitio permite armar una cotización de producción técnica/eventos VIP,
calcular el total en vivo y generar un PDF con marca de agua y un Excel
ejecutivo del lado del cliente. Al pulsar **Generar Cotización (PDF & Excel)**
el navegador descarga ambos archivos y los envía al backend
(`POST /api/enviar-cotizacion-correo`), que los reenvía por correo a la
secretaria, el jefe y el administrador para que puedan coordinar con logística
los equipos, el personal y los espacios del evento. El envío por WhatsApp
permanece pendiente.

> Esta migración solo reorganiza el proyecto en un monorepo `apps/web` +
> `apps/server` y convierte el código a TypeScript. No se modificó el
> estilo visual ni el comportamiento funcional original.