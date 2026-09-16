# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11.18.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
RUN npm install -g pnpm@11.18.0
COPY package.json pnpm-lock.yaml ./
# npm/npx no se necesitan en runtime (solo "node dist/...") -- se elimina
# el CLI completo de npm, incluyendo su propio node-tar vendorizado
# (CVE-2026-59873, node-tar DoS via gzip bomb), en vez de solo desinstalar
# pnpm (bloqueado por Trivy en el pipeline, ver P8/docs/evidencia).
RUN pnpm install --prod --frozen-lockfile --ignore-scripts \
    && npm uninstall -g pnpm \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
    && rm -rf /root/.local/share/pnpm /root/.cache
COPY --from=build /app/dist ./dist

USER node
CMD ["node", "dist/index.js"]
