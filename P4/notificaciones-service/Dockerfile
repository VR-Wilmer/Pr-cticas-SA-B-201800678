FROM node:22-alpine
WORKDIR /app

RUN npm install -g pnpm@11.18.0

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN pnpm install --ignore-scripts

COPY . .

EXPOSE 4400
CMD ["pnpm", "run", "dev"]
