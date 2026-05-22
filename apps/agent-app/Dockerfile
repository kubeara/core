ARG NODE_VERSION=24.15.0

FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json nest-cli.json ./
COPY apps/agent-app ./apps/agent-app
COPY libs ./libs

RUN npm ci --ignore-scripts
RUN npm run build:agent-app

FROM node:${NODE_VERSION}-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/apps/agent-app/apps/agent-app/src/main.js"]
