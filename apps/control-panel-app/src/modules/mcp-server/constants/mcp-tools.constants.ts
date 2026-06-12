export const MCP_SERVER_LIST_LIMIT = 100;

export const SERVICE_NAME_TO_TEMPLATE_SLUG: Record<string, string> = {
  redis: "redis",
  postgresql: "postgres",
  postgres: "postgres",
  postgresv2: "postgres",
  n8n: "n8n",
  grafana: "grafana",
  gitea: "gitea",
  gitlab: "gitlab-ce",
  "gitlab-ce": "gitlab-ce",
  wordpress: "wordpress",
  directus: "directus",
  strapi: "strapi",
  prometheus: "prometheus",
  "uptime-kuma": "uptime-kuma",
  "uptime kuma": "uptime-kuma",
  "code-server": "code-server",
  "sql-server": "sql-server",
};
