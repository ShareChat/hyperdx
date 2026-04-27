# HyperDX API and App Server Dockerfile
# This Dockerfile creates a single image with both the API and App servers

ARG NODE_VERSION=22.16.0

# Base stage with Node.js and dependencies
FROM node:${NODE_VERSION}-alpine AS base

WORKDIR /app

# Copy workspace configuration files
COPY .yarn ./.yarn
COPY .yarnrc.yml yarn.lock package.json nx.json .prettierrc .prettierignore tsconfig.base.json ./

# Copy package.json files for all packages
COPY ./packages/common-utils/package.json ./packages/common-utils/
COPY ./packages/api/package.json ./packages/api/
COPY ./packages/app/package.json ./packages/app/

# Install dependencies
RUN apk add --no-cache libc6-compat
RUN yarn install --mode=skip-build && yarn cache clean

# Builder stage
FROM base AS builder

WORKDIR /app

# Copy source code for all packages
COPY ./packages/common-utils ./packages/common-utils
COPY ./packages/api ./packages/api
COPY ./packages/app ./packages/app

# Set build environment variables
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_IS_LOCAL_MODE=false
ENV NEXT_OUTPUT_STANDALONE=true
ENV NX_DAEMON=false

# Build packages in dependency order
RUN yarn workspace @hyperdx/common-utils build
RUN yarn workspace @hyperdx/api build
RUN yarn workspace @hyperdx/app build

# Production stage
FROM node:${NODE_VERSION}-alpine AS production

ARG CODE_VERSION=2.1.1

ENV CODE_VERSION=2.1.1
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

USER nodejs

WORKDIR /app

# Copy built API (builds to 'build/', not 'dist/')
COPY --chown=nodejs:nodejs --from=builder /app/packages/api/build ./packages/api/build
COPY --chown=nodejs:nodejs --from=builder /app/packages/api/bin ./packages/api/bin
COPY --chown=nodejs:nodejs --from=builder /app/packages/api/package.json ./packages/api/package.json

# Copy built App (Next.js standalone output)
# Standalone mode mirrors the monorepo tree inside .next/standalone, so the
# app server ends up at packages/app/packages/app/server.js in the container.
COPY --chown=nodejs:nodejs --from=builder /app/packages/app/.next/standalone ./packages/app
COPY --chown=nodejs:nodejs --from=builder /app/packages/app/.next/static ./packages/app/packages/app/.next/static
COPY --chown=nodejs:nodejs --from=builder /app/packages/app/public ./packages/app/packages/app/public

# Copy built common-utils
COPY --chown=nodejs:nodejs --from=builder /app/packages/common-utils/dist ./packages/common-utils/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/common-utils/package.json ./packages/common-utils/package.json

# Copy node_modules for runtime dependencies
# (concurrently is in the root node_modules, no global install needed)
COPY --chown=nodejs:nodejs --from=builder /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs --from=builder /app/packages/api/node_modules ./packages/api/node_modules
COPY --chown=nodejs:nodejs --from=builder /app/packages/common-utils/node_modules ./packages/common-utils/node_modules

# Copy and set up entry script
COPY --chown=nodejs:nodejs docker/hyperdx/entry.prod.sh /etc/local/entry.sh
RUN chmod +x /etc/local/entry.sh

# Expose ports
EXPOSE 8000 8080

# Health check via Node (curl not available in alpine by default)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8000/health',r=>r.statusCode===200?process.exit(0):process.exit(1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["sh", "/etc/local/entry.sh"]
