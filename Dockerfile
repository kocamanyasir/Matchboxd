# Production Dockerfile for Matchboxd on Render.com (with Puppeteer & Chromium)
FROM node:20-bookworm-slim

# Install system dependencies, Chromium and international fonts
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-freefont-ttf \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-kacst \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Configure Puppeteer to use the pre-installed Debian Chromium binary
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies required to build the Next.js application
RUN npm ci

# Copy application source code
COPY . .

# Build Next.js optimized production bundle
RUN npm run build

# Remove development dependencies to keep memory and disk footprint minimal
RUN npm prune --production

# Clean scratch directory if present
RUN rm -rf scratch

# Render provides the port via $PORT, defaults to 3000
EXPOSE 3000

CMD ["npm", "start"]
