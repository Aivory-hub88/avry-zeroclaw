FROM node:18-alpine

# Install dependencies
RUN apk add --no-cache curl bash

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p /app/logs && chown -R node:node /app/logs

# Expose port (uses PORT env, defaults to 8090)
EXPOSE 8090

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8090/health || exit 1

# Run as non-root user
USER node

# Start server
CMD ["node", "server.js"]
