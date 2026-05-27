import { queryClient } from "@/api/query-client";
import { QUERY_KEYS } from "@/constants/query-keys";
import { getCurrentUser } from "./api";
import {
    hasStoredSession,
    hydrateTokensFromStorage,
} from "./utils/token-manager";

/**
 * Restore an authenticated session from persisted tokens.
 *
 * - Hydrates in-memory tokens from localStorage
 * - Calls /auth/me when an access token is present
 * - Populates the TanStack Query auth cache
 */
export async function restoreAuthSession(): Promise<boolean> {
    hydrateTokensFromStorage();

    if (!hasStoredSession()) {
        queryClient.setQueryData(QUERY_KEYS.auth.me, null);
        return false;
    }

    const user = await queryClient.fetchQuery({
        queryKey: QUERY_KEYS.auth.me,
        queryFn: getCurrentUser,
        retry: false,
        staleTime: 1000 * 60 * 5,
    });

    return user !== null;
}
