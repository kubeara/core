ARG NODE_VERSION=24.15.0

FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

COPY console-app/package*.json ./
RUN npm ci --ignore-scripts

COPY console-app ./
# Runtime URL comes from /env.js at container start — do not bake a dev URL into the bundle.
ENV VITE_API_URL=
RUN npm run build

FROM nginx:1.27-alpine AS runner

ARG GITHUB_REPOSITORY=unknown
ARG GITHUB_SHA=unknown
LABEL org.opencontainers.image.source=$GITHUB_REPOSITORY
LABEL org.opencontainers.image.revision=$GITHUB_SHA

COPY console-app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
COPY console-app/docker-entrypoint-env.sh /usr/local/bin/kubeara-write-env.sh
COPY console-app/docker-entrypoint.sh /docker-entrypoint-kubeara.sh
RUN chmod +x /usr/local/bin/kubeara-write-env.sh /docker-entrypoint-kubeara.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint-kubeara.sh"]
CMD ["nginx", "-g", "daemon off;"]
