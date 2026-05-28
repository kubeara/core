import { QueryClient } from "@tanstack/react-query";

/**
 * Centralized TanStack Query client configuration.
 * 
 * Configuration:
 * - staleTime: 30 seconds - data is considered fresh for 30s
 * - retry: 1 - retry failed queries once before giving up
 * - refetchOnWindowFocus: true - refetch when user returns to tab
 * - mutations don't retry by default
 * 
 * This client is provided to the app via QueryClientProvider in the Providers component.
 * 
 * @example
 * import { queryClient } from '@/api/query-client';
 * 
 * // Manually invalidate queries
 * queryClient.invalidateQueries({ queryKey: ['servers'] });
 * 
 * // Manually set query data
 * queryClient.setQueryData(['auth', 'me'], user);
 * 
 * // Clear all queries
 * queryClient.clear();
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000, // 30 seconds
            retry: 1,
            refetchOnWindowFocus: true,
        },
        mutations: {
            retry: 0,
        },
    },
});
