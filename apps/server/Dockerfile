# Contexto de build: raíz del monorepo (ver docker-compose.yml)

# --- Etapa 1: compilar --------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
# El servidor usa el paquete @my-app/db del monorepo: se instala desde la raíz (workspaces) para que
# lo encuentre. Se copian primero solo los package.json para aprovechar la caché de Docker.
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages ./packages
RUN npm ci --workspace apps/server
COPY apps/server ./apps/server
# Deja UN solo archivo (dist/index.js) con @my-app/db incluido; ver apps/server/scripts/build.mjs
RUN npm run build --workspace apps/server

# --- Etapa 2: imagen final ----------------------------------------------------------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# Solo las dependencias de ejecución. @my-app/db (del monorepo, no está en el registro público de npm)
# ya viene dentro de dist/index.js; se quita junto con las demás de desarrollo antes de instalar.
COPY apps/server/package.json ./
RUN node -e "const f='package.json',p=JSON.parse(require('fs').readFileSync(f));delete p.devDependencies;delete p.scripts;require('fs').writeFileSync(f,JSON.stringify(p,null,2))" \
 && npm install --omit=dev
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/assets ./assets
# Contratos firmados: esta carpeta se monta como volumen en docker-compose.yml para que sobreviva
# a los despliegues. Se crea aquí (con dueño "node") para que el volumen nuevo herede el permiso.
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node
ENV UPLOADS_DIR=/app/uploads

EXPOSE 3000
CMD ["node", "dist/index.js"]
