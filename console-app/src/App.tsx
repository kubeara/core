import { Providers } from "@/app/providers";
import { AuthProvider } from "@/features/auth/context/auth-context";
import { AppRoutes } from "@/app/router";
import { RecaptchaScript } from "@/components/support/recaptcha-widget";
import { FloatingChatWidget } from "@/components/support/floating-chat-widget/floating-chat-widget";

/**
 * Root application component.
 * 
 * Provides the application with:
 * - TanStack Query client (via Providers)
 * - Theme provider (via Providers)
 * - Authentication context (via AuthProvider)
 * - Application routes (via AppRoutes)
 * 
 * The provider hierarchy is important:
 * 1. Providers → Sets up Query Client and Theme
 * 2. AuthProvider → Fetches current user for persistent login
 * 3. AppRoutes → Renders routes with auth guards
 * 
 * Note: BrowserRouter is provided in main.tsx
 */
export function App() {
  return (
    <Providers>
      <RecaptchaScript />
      <AuthProvider>
        <AppRoutes />
        <FloatingChatWidget />
      </AuthProvider>
    </Providers>
  );
}
