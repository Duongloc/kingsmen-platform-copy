# ═══════════════════════════════════════════════════════════════
# KINGSMEN TRAINING PLATFORM — Multi-stage Docker Build
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Build ──
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first (layer caching)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --prefer-offline

# Copy source files
COPY index.html vite.config.js ./
COPY src/ ./src/
COPY kingsmen-platform-v3_3.jsx ./

# Build args for Supabase credentials (injected at build time)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Build the production bundle
RUN npm run build

# ── Stage 2: Serve with Nginx ──
FROM nginx:1.27-alpine AS production

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
