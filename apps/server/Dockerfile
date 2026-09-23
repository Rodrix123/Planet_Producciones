# Contexto de build: raíz del monorepo (ver docker-compose.yml)
FROM node:20-alpine AS build
WORKDIR /app
COPY packages/config ./packages/config
COPY apps/server/package*.json ./apps/server/
WORKDIR /app/apps/server
RUN npm install
COPY apps/server ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY apps/server/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/assets ./assets

EXPOSE 3000
CMD ["node", "dist/index.js"]
