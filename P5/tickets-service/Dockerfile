# syntax=docker/dockerfile:1

# ---- build: instala TODAS las dependencias (incl. devDependencies) y compila TS -> JS ----
FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11.18.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

# ---- production: solo dependencias de produccion + el dist/ ya compilado ----
FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
RUN npm install -g pnpm@11.18.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts \
    && npm uninstall -g pnpm \
    && rm -rf /root/.local/share/pnpm /root/.cache
COPY --from=build /app/dist ./dist
COPY schema.graphql ./schema.graphql

USER node
EXPOSE 4200
CMD ["node", "dist/server.js"]
