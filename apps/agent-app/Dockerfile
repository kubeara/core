ARG NODE_VERSION=24.15.0

FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

# node-pty compiles against the Node headers already in this image (no header download).
ENV npm_config_nodedir=/usr/local

RUN apk add --no-cache python3 make g++ linux-headers

COPY package*.json ./
COPY tsconfig*.json nest-cli.json ./
COPY apps/agent-app ./apps/agent-app
COPY libs ./libs

# Compile native deps once in the builder; skip postinstall during install.
RUN npm ci --ignore-scripts && npm rebuild node-pty
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

# Reuse node-pty built in the builder (avoids a second native compile in runner).
COPY --from=builder /app/node_modules/node-pty ./node_modules/node-pty

COPY --from=builder /app/dist ./dist
COPY apps/agent-app/proxy /app/proxy

EXPOSE 3001

CMD ["node", "dist/apps/agent-app/src/main.js"]
