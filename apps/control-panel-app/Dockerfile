ARG NODE_VERSION=24.15.0

FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json nest-cli.json ./
COPY apps/control-panel-app ./apps/control-panel-app
COPY libs ./libs

RUN npm ci --ignore-scripts
RUN npm run build:control-panel-app

FROM node:${NODE_VERSION}-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/control-panel-app/templates ./apps/control-panel-app/templates

EXPOSE 3000

CMD ["node", "dist/apps/control-panel-app/src/main.js"]
