import type { Template } from "@/types";

export const templates: Template[] = [
  {
    id: "postgresql",
    name: "PostgreSQL",
    description: "Relational database for structured data and ACID transactions.",
    category: "Database",
    color: "#336791",
  },
  {
    id: "mongodb",
    name: "MongoDB",
    description: "Document database for flexible, JSON-like schemas at scale.",
    category: "Database",
    color: "#47A248",
  },
  {
    id: "redis",
    name: "Redis",
    description: "In-memory data store for caching, queues, and pub/sub.",
    category: "Cache",
    color: "#DC382D",
  },
  {
    id: "n8n",
    name: "n8n",
    description: "Workflow automation to connect APIs and services visually.",
    category: "Automation",
    color: "#EA4B71",
  },
  {
    id: "mysql",
    name: "MySQL",
    description: "Popular open-source relational database for web apps.",
    category: "Database",
    color: "#00758F",
  },
  {
    id: "kafka",
    name: "Apache Kafka",
    description: "Distributed event streaming for real-time pipelines.",
    category: "Messaging",
    color: "#231F20",
  },
  {
    id: "rabbitmq",
    name: "RabbitMQ",
    description: "Message broker for reliable async communication.",
    category: "Messaging",
    color: "#FF6600",
  },
  {
    id: "elasticsearch",
    name: "Elasticsearch",
    description: "Search and analytics engine for logs and full-text search.",
    category: "Search",
    color: "#005571",
  },
  {
    id: "minio",
    name: "MinIO",
    description: "S3-compatible object storage for files and backups.",
    category: "Storage",
    color: "#C72C48",
  },
  {
    id: "grafana",
    name: "Grafana",
    description: "Observability dashboards for metrics, logs, and traces.",
    category: "Monitoring",
    color: "#F46800",
  },
  {
    id: "prometheus",
    name: "Prometheus",
    description: "Time-series monitoring and alerting toolkit.",
    category: "Monitoring",
    color: "#E6522C",
  },
  {
    id: "nginx",
    name: "NGINX",
    description: "High-performance reverse proxy and load balancer.",
    category: "Infrastructure",
    color: "#009639",
  },
];

export function getTemplateById(id: string): Template | undefined {
  return templates.find((t) => t.id === id);
}
