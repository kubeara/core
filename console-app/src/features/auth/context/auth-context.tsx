import {
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import { queryClient } from "@/api/query-client";
import { QUERY_KEYS } from "@/constants/query-keys";
import { restoreAuthSession } from "../bootstrap";
import { useCurrentUserQuery } from "../hooks";

import {
    hasStoredSession,
    subscribeToTokenChanges,
    subscribeToTokenStorageChanges,
} from "../utils/token-manager";

import type { AuthBootstrapState } from "../types";

import { AuthContext, type AuthContextValue } from "./use-auth";

export function AuthProvider({ children }: { children: ReactNode }) {
    const [bootstrap, setBootstrap] = useState<AuthBootstrapState>({
        status: "loading",
    });

    const [hasPersistedSession, setHasPersistedSession] = useState(
        () => hasStoredSession(),
    );

    useEffect(() => {
        let cancelled = false;

        restoreAuthSession()
            .then((sessionRestored) => {
                if (!cancelled) {
                    setBootstrap({
                        status: "ready",
                        sessionRestored,
                    });
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setBootstrap({
                        status: "ready",
                        sessionRestored: false,
                    });
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const isReady = bootstrap.status === "ready";

    const shouldSyncUser = isReady && hasPersistedSession;

    const {
        data: user = null,
        isFetching,
        refetch,
    } = useCurrentUserQuery({
        enabled: shouldSyncUser,
    });

    useEffect(() => {
        function syncSessionState(): void {
            setHasPersistedSession(hasStoredSession());
        }

        const unsubscribeLocal =
            subscribeToTokenChanges(syncSessionState);

        const unsubscribeStorage =
            subscribeToTokenStorageChanges(syncSessionState);

        return () => {
            unsubscribeLocal();
            unsubscribeStorage();
        };
    }, []);

    useEffect(() => {
        return subscribeToTokenChanges(() => {
            if (hasStoredSession()) {
                void refetch();
                return;
            }
            queryClient.setQueryData(QUERY_KEYS.auth.me, null);
        });
    }, [refetch]);

    const value = useMemo<AuthContextValue>(() => {
        const isBootstrapping =
            bootstrap.status === "loading";

        const isRestoringUser =
            shouldSyncUser &&
            user === null &&
            isFetching;

        return {
            user,
            isAuthenticated: user !== null,
            isLoading:
                isBootstrapping || isRestoringUser,
        };
    }, [
        bootstrap.status,
        isFetching,
        shouldSyncUser,
        user,
    ]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}