# --- Build Stage ---
FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy npm workspace files
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

# Install all dependencies
RUN npm ci

# Copy the API source code
COPY apps/api ./apps/api

# Generate Prisma client and compile the TypeScript code
WORKDIR /app/apps/api
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build

# Make the start script executable in the builder stage
RUN chmod +x /app/apps/api/start.sh

# --- Runner Stage ---
FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy all built assets and dependencies from builder
COPY --from=builder /app /app

# Expose Hono server port
EXPOSE 7070

# Environment variables
ENV NODE_ENV=production
ENV PORT=7070

# Run startup script
CMD ["/app/apps/api/start.sh"]
