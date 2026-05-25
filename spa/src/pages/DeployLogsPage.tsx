import { useParams } from "react-router-dom";
import { DeploymentLogs } from "@/components/deployment-logs";
import { getTemplateById } from "@/lib/templates";
import { NotFoundPage } from "@/pages/NotFoundPage";

export function DeployLogsPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const template = templateId ? getTemplateById(templateId) : undefined;

  if (!template) {
    return <NotFoundPage />;
  }

  return <DeploymentLogs template={template} />;
}
