ARG NODE_VERSION=24.15.0

FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

COPY spa/package*.json ./
RUN npm ci --ignore-scripts

COPY spa ./
RUN npm run build

FROM nginx:1.27-alpine AS runner

ARG GITHUB_REPOSITORY=unknown
ARG GITHUB_SHA=unknown
LABEL org.opencontainers.image.source=$GITHUB_REPOSITORY
LABEL org.opencontainers.image.revision=$GITHUB_SHA

COPY spa/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
COPY spa/docker-entrypoint-env.sh /docker-entrypoint.d/40-env.sh
RUN chmod +x /docker-entrypoint.d/40-env.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
