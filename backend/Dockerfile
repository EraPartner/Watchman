# Backend Dockerfile
# Build a small production image for the Node backend
FROM node:18-alpine AS base

WORKDIR /app

# Install production dependencies only
FROM base AS deps
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --only=production

# Application image
FROM base AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY backend/ .

ENV NODE_ENV=production
EXPOSE 3001

# Use a non-root user for better security
RUN addgroup -S watchman && adduser -S -G watchman watchman
USER watchman

CMD ["node", "server.js"]
