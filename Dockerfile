# --- Base Stage ---
FROM node:20-slim AS base
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy npm workspace files
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

# Install all dependencies
RUN npm ci

# --- Builder Stage for Web ---
FROM base AS builder-web
# Copy the Web source code
COPY apps/web ./apps/web
# Build the Next.js app
WORKDIR /app/apps/web
RUN npm run build

# --- Runner Stage for Web ---
FROM node:20-slim AS web
WORKDIR /app
# Copy built assets and dependencies from builder-web
COPY --from=builder-web /app /app
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app/apps/web
CMD ["npm", "run", "start"]

# --- Builder Stage for API ---
FROM base AS builder-api
# Copy the API source code
COPY apps/api ./apps/api
# Generate Prisma client and compile the TypeScript code
WORKDIR /app/apps/api
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build
RUN chmod +x /app/apps/api/start.sh

# --- Runner Stage for API (Default Target) ---
FROM node:20-slim AS api
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Copy built assets and dependencies from builder-api
COPY --from=builder-api /app /app
EXPOSE 7070
ENV NODE_ENV=production
ENV PORT=7070
CMD ["/app/apps/api/start.sh"]
