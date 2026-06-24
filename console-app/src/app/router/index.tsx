import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { AppLayout } from "../layouts/app-layout";
import { AuthLayout } from "../layouts/auth-layout";
import { GuestRoute, HomeRedirect, ProtectedRoute } from "@/features/auth/routes/auth-routes";
import { DeployConfigurePage } from "@/pages/deploy-configure-page";
import { DeployLogsPage } from "@/pages/deploy-logs-page";
import { ContainerLogsPage } from "@/pages/container-logs-page";
import { ForgotPasswordPage } from "@/pages/forgot-password-page";
import { LoginPage } from "@/pages/login-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { ProfilePage } from "@/pages/profile-page";
import { RegisterPage } from "@/pages/register-page";
import { ResetPasswordPage } from "@/pages/reset-password-page";
import { ServerDetailPage } from "@/pages/server-detail-page";
import { McpServersPage } from "@/pages/mcp-servers-page";
import { ServersPage } from "@/pages/servers-page";
import { TemplatesPage } from "@/pages/templates-page";
import { PlansPage } from "@/pages/plans-page";
import { CheckoutPage } from "@/pages/checkout-page";

function RedirectSubscriptionToPlans() {
  const { search } = useLocation();
  return <Navigate to={`/plans${search}`} replace />;
}

const SentryRoutes = Sentry.withSentryReactRouterV7Routing(Routes);

/**
 * Application router configuration.
 */
export function AppRoutes() {
  return (
    <SentryRoutes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/dashboard" element={<Navigate to="/servers" replace />} />

      <Route element={<GuestRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/servers" element={<ServersPage />} />
          <Route path="/mcp-servers" element={<McpServersPage />} />
          <Route path="/servers/:id" element={<ServerDetailPage />} />
          <Route
            path="/servers/:serverId/deploy/:templateSlug"
            element={<DeployConfigurePage />}
          />
          <Route
            path="/servers/:serverId/deploy/:templateSlug/logs"
            element={<DeployLogsPage />}
          />
          <Route
            path="/servers/:serverId/containers/:containerId/logs"
            element={<ContainerLogsPage />}
          />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/checkout/:planSlug" element={<CheckoutPage />} />
          <Route path="/subscription" element={<RedirectSubscriptionToPlans />} />

          <Route
            path="/deploy/:templateSlug"
            element={<Navigate to="/servers" replace />}
          />
          <Route
            path="/deploy/:templateSlug/logs"
            element={<Navigate to="/servers" replace />}
          />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </SentryRoutes>
  );
}
