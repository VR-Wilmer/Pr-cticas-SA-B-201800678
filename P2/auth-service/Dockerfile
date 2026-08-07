FROM node:22-alpine
WORKDIR /app

RUN npm install -g pnpm@11.18.0

COPY package.json ./
RUN pnpm install

COPY . .

EXPOSE 4100
CMD ["pnpm", "run", "dev"]
