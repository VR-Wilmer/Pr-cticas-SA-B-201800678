FROM node:22-alpine
WORKDIR /app

RUN npm install -g pnpm@11.18.0

COPY package.json pnpm-workspace.yaml ./
RUN pnpm install

COPY . .

EXPOSE 5173
CMD ["pnpm", "run", "dev"]
