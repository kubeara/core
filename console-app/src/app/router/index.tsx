import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../layouts/app-layout";
import { AuthLayout } from "../layouts/auth-layout";
import { GuestRoute } from "@/features/auth/routes/guest-route";
import { ProtectedRoute } from "@/features/auth/routes/protected-route";
import { DeployConfigurePage } from "@/pages/deploy-configure-page";
import { DeployLogsPage } from "@/pages/deploy-logs-page";
import { ForgotPasswordPage } from "@/pages/forgot-password-page";
import { HomeRedirect } from "@/pages/home-redirect";
import { LoginPage } from "@/pages/login-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { ProfilePage } from "@/pages/profile-page";
import { RegisterPage } from "@/pages/register-page";
import { ResetPasswordPage } from "@/pages/reset-password-page";
import { ServerDetailPage } from "@/pages/server-detail-page";
import { ServersPage } from "@/pages/servers-page";
import { TemplatesPage } from "@/pages/templates-page";

/**
 * Application router configuration.
 */
export function AppRoutes() {
  return (
    <Routes>
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
          <Route path="/servers/:id" element={<ServerDetailPage />} />
          <Route
            path="/servers/:serverId/deploy/:templateSlug"
            element={<DeployConfigurePage />}
          />
          <Route
            path="/servers/:serverId/deploy/:templateSlug/logs"
            element={<DeployLogsPage />}
          />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/profile" element={<ProfilePage />} />

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
    </Routes>
  );
}
