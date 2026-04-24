FROM node:20-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/src ./src

FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine
LABEL maintainer="DevTrace Studio" \
      org.opencontainers.image.title="devtrace-collector" \
      org.opencontainers.image.description="DevTrace Studio collector backend with React dashboard"

RUN addgroup -g 1001 devtrace && adduser -u 1001 -G devtrace -s /bin/sh -D devtrace

WORKDIR /app

# Backend
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/src ./src
COPY backend/package.json ./package.json

# Frontend static files served by Express in production
COPY --from=frontend-build /app/frontend/dist ./public

USER devtrace

ENV NODE_ENV=production \
    PORT=9000 \
    DEVTRACE_LOG_LEVEL=info

EXPOSE 9000

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:9000/api/v1/health || exit 1

CMD ["node", "src/server.js"]

