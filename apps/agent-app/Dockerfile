ARG NODE_VERSION=24.15.0

FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json nest-cli.json ./
COPY apps/agent-app ./apps/agent-app
COPY libs ./libs

# Skip postinstall scripts; no native modules need compiling.
RUN npm ci --ignore-scripts
RUN npm run build:agent-app

FROM node:${NODE_VERSION}-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ARG GITHUB_REPOSITORY=unknown
ARG GITHUB_SHA=unknown
LABEL org.opencontainers.image.source=$GITHUB_REPOSITORY
LABEL org.opencontainers.image.revision=$GITHUB_SHA

# Client only: talks to host daemon via /var/run/docker.sock (see deploy compose).
RUN apk add --no-cache docker-cli docker-cli-compose

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY apps/agent-app/proxy /app/proxy

EXPOSE 3001

CMD ["node", "dist/apps/agent-app/src/main.js"]
