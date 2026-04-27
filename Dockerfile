# HyperDX API and App Server Dockerfile
# This Dockerfile creates a single image with both the API and App servers

ARG NODE_VERSION=22.16.0

# Base stage with Node.js and dependencies
FROM node:${NODE_VERSION}-alpine AS base

WORKDIR /app

# Copy workspace configuration files
COPY .yarn ./.yarn
COPY .yarnrc.yml yarn.lock package.json nx.json .prettierrc .prettierignore tsconfig.base.json ./

# Copy package.json files for all packages (needed for yarn install workspace resolution)
COPY ./packages/common-utils/package.json ./packages/common-utils/
COPY ./packages/api/package.json ./packages/api/
COPY ./packages/app/package.json ./packages/app/

# Install dependencies
RUN apk add --no-cache libc6-compat
RUN yarn install --mode=skip-build && yarn cache clean

# Builder stage
FROM base AS builder

WORKDIR /app

# Copy common-utils source
COPY ./packages/common-utils ./packages/common-utils

# Copy API source selectively: only src/ and bin/ so tsc infers rootDir=src/,
# keeping compiled output flat at build/index.js (matching bin/hyperdx expectations).
# Copying migrations/ or scripts/ would shift rootDir to the package root and break tsc-alias.
COPY ./packages/api/src ./packages/api/src
COPY ./packages/api/bin ./packages/api/bin
COPY ./packages/api/tsconfig.json ./packages/api/tsconfig.json
COPY ./packages/api/tsconfig.build.json ./packages/api/tsconfig.build.json

# Copy app source
COPY ./packages/app ./packages/app

# Set build environment variables
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_IS_LOCAL_MODE=false
ENV NEXT_OUTPUT_STANDALONE=true
ENV NX_DAEMON=false

# Build packages in dependency order
RUN yarn workspace @hyperdx/common-utils build
# CACHE_BUST_API: increment to force rebuild of this layer
ARG CACHE_BUST_API=4
RUN yarn workspace @hyperdx/api build
RUN test -f packages/api/build/index.js || \
    (echo "ERROR: packages/api/build/index.js missing" && find packages/api/build -name "*.js" | head -20 && exit 1)
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

# Copy built API
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
# Yarn 4 workspaces hoist all deps to root node_modules; no per-package node_modules exist
COPY --chown=nodejs:nodejs --from=builder /app/node_modules ./node_modules

# Copy and set up entry script
COPY --chown=nodejs:nodejs docker/hyperdx/entry.prod.sh /etc/local/entry.sh
RUN chmod +x /etc/local/entry.sh

# Expose ports
EXPOSE 8000 8080

# Health check via Node (curl not available in alpine by default)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8000/health',r=>r.statusCode===200?process.exit(0):process.exit(1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["sh", "/etc/local/entry.sh"]
