import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../layouts/app-layout";
import { AuthLayout } from "../layouts/auth-layout";
import { GuestRoute } from "@/features/auth/routes/guest-route";
import { ProtectedRoute } from "@/features/auth/routes/protected-route";
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
 * 
 * Route Structure:
 * - / → Redirects to /templates or /login based on auth status
 * - /dashboard → Redirects to /templates
 * 
 * Guest Routes (AuthLayout):
 * - /login → Login page
 * - /register → Signup page
 * - /forgot-password → Request password reset
 * - /reset-password → Reset password with OTP
 * 
 * Protected Routes (AppLayout):
 * - /servers → Server list
 * - /servers/:id → Server details
 * - /templates → Template catalog
 * - /profile → User profile
 * - /deploy/:templateId/logs → Deployment logs
 * 
 * Fallback:
 * - * → 404 Not Found page
 * 
 * @example
 * // In main.tsx
 * <BrowserRouter>
 *   <AuthProvider>
 *     <AppRoutes />
 *   </AuthProvider>
 * </BrowserRouter>
 */
export function AppRoutes() {
    return (
        <Routes>
            {/* Root redirect */}
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/dashboard" element={<Navigate to="/templates" replace />} />

            {/* Guest-only routes */}
            <Route element={<GuestRoute />}>
                <Route element={<AuthLayout />}>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                </Route>
            </Route>

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                    <Route path="/servers" element={<ServersPage />} />
                    <Route path="/servers/:id" element={<ServerDetailPage />} />
                    <Route path="/templates" element={<TemplatesPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route
                        path="/deploy/:templateId/logs"
                        element={<DeployLogsPage />}
                    />
                </Route>
            </Route>

            {/* 404 fallback */}
            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
}
