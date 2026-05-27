import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/api/query-client";
import { ThemeProvider } from "@/components/shared/theme-provider";

/**
 * Root providers component.
 * 
 * Wraps the application with all necessary providers:
 * - QueryClientProvider: TanStack Query for data fetching
 * - ThemeProvider: Dark/light theme support
 * 
 * Note: AuthProvider is added in main.tsx after BrowserRouter
 * to ensure routing context is available for auth redirects.
 * 
 * @param children - The application component tree
 * 
 * @example
 * // In main.tsx
 * <Providers>
 *   <BrowserRouter>
 *     <AuthProvider>
 *       <App />
 *     </AuthProvider>
 *   </BrowserRouter>
 * </Providers>
 */
export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>{children}</ThemeProvider>
        </QueryClientProvider>
    );
}
