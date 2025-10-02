# Backend Dockerfile
# Build a small production image for the Node backend
FROM node:18-alpine AS base

WORKDIR /app

# Multi-stage build for production optimization
FROM node:18-alpine AS builder

# Security: Install security updates
RUN apk upgrade --no-cache

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including devDependencies for build
RUN npm ci --no-audit --no-fund

# Copy source code
COPY . .

# Production stage
FROM node:18-alpine AS production

# Security: Install security updates and required packages
RUN apk upgrade --no-cache && \
    apk add --no-cache dumb-init curl

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S watchman -u 1001 -G nodejs

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# Copy application files
COPY --chown=watchman:nodejs . .

# Security: Set proper file permissions
RUN chmod -R 755 /app && \
    chown -R watchman:nodejs /app

# Remove unnecessary files
RUN rm -rf /var/cache/apk/* /tmp/* /var/tmp/* ~/.npm

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Switch to non-root user
USER watchman

# Expose port
EXPOSE 3001

# Environment
ENV NODE_ENV=production
ENV PORT=3001

# Use dumb-init for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]