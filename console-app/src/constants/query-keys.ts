/**
 * Centralized query keys for TanStack Query.
 * 
 * Benefits:
 * - Type-safe query keys
 * - Easy to find all queries in one place
 * - Consistent key structure across the app
 * - Easier cache invalidation
 * 
 * @example
 * // In a query hook
 * useQuery({
 *   queryKey: QUERY_KEYS.auth.me,
 *   queryFn: getCurrentUser,
 * });
 * 
 * // Invalidate all server queries
 * queryClient.invalidateQueries({ queryKey: QUERY_KEYS.servers.all });
 * 
 * // Invalidate a specific server
 * queryClient.invalidateQueries({ queryKey: QUERY_KEYS.servers.detail(serverId) });
 */
export const QUERY_KEYS = {
    /**
     * Authentication-related queries
     */
    auth: {
        /** Current user query key */
        me: ["auth", "me"] as const,
    },

    /**
     * Server-related queries
     */
    servers: {
        /** Prefix for all server list queries */
        lists: () => ["servers", "list"] as const,

        /** Paginated servers list query key */
        list: (params: Record<string, unknown>) =>
            ["servers", "list", params] as const,

        /** Legacy alias for list invalidation */
        all: ["servers", "list"] as const,

        /**
         * Single server detail query key
         * @param id - Server ID
         */
        detail: (id: string) => ["servers", id] as const,

        /** On-demand server resource metrics query key */
        resources: (serverId: string) =>
            ["servers", serverId, "resources"] as const,
    },

    /**
     * Template marketplace queries
     */
    templates: {
        all: ["templates"] as const,
        list: (serverId?: string) =>
            serverId
                ? (["templates", "list", serverId] as const)
                : (["templates", "list"] as const),
        detail: (slug: string) => ["templates", slug] as const,
    },

    deployments: {
        all: ["deployments"] as const,
        byServer: (serverId: string) =>
            ["deployments", "server", serverId] as const,
        containers: (serverId: string) =>
            ["deployments", "server", serverId, "containers"] as const,
        detail: (deploymentId: string) =>
            ["deployments", deploymentId] as const,
    },

    /**
     * Profile-related queries
     */
    profile: {
        /** User profile query key (same as auth.me) */
        me: ["auth", "me"] as const,
    },
} as const;
