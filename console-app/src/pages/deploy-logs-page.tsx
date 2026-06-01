import { useParams } from "react-router-dom";
import { DeploymentLogs } from "@/components/deployment-logs";
import { getTemplateById } from "@/lib/templates";
import { NotFoundPage } from "./not-found-page";

/**
 * Deployment logs page.
 * 
 * Displays real-time logs for a template deployment.
 * Shows 404 if template ID is invalid.
 */
export function DeployLogsPage() {
    const { templateId } = useParams<{ templateId: string }>();
    const template = templateId ? getTemplateById(templateId) : undefined;

    if (!template) {
        return <NotFoundPage />;
    }

    return <DeploymentLogs template={template} />;
}
