# Dockerfile for my-app server
# Optimized multi-stage build for Railway deployment

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm/yarn if needed

# Copy package files
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/db/package.json ./packages/db/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build --workspace=apps/server

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000


# Copy built application
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./

# Install production dependencies only
RUN npm ci --omit=dev

EXPOSE 3000

CMD ["node", "dist/index.js"]
