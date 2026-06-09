import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AuthContext,
} from "./use-auth";

import { queryClient } from "@/api/query-client";
import { QUERY_KEYS } from "@/constants/query-keys";
import type { User } from "@/types";
import { getCurrentUser } from "../api";
import { useCurrentUserQuery, clearAuthUserCache } from "../hooks";
import {
  getSessionLifecycle,
  markBootstrapComplete,
  subscribeToAuthChanges,
  type SessionLifecycle,
} from "../utils/session-manager";

export type AuthContextValue = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
};

async function restoreAuthSession(): Promise<boolean> {
  try {
    const user = await queryClient.fetchQuery({
      queryKey: QUERY_KEYS.auth.me,
      queryFn: getCurrentUser,
      retry: false,
      staleTime: 1000 * 60 * 5,
    });

    return user !== null;
  } catch {
    queryClient.setQueryData(QUERY_KEYS.auth.me, null);
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [lifecycle, setLifecycle] = useState<SessionLifecycle>(() =>
    getSessionLifecycle(),
  );

  useEffect(() => {
    let cancelled = false;

    restoreAuthSession()
      .then((sessionRestored) => {
        if (cancelled) {
          return;
        }

        markBootstrapComplete(sessionRestored);
        setLifecycle(getSessionLifecycle());
        setIsReady(true);
      })
      .catch(async () => {
        if (cancelled) {
          return;
        }

        markBootstrapComplete(false);
        setLifecycle(getSessionLifecycle());
        await clearAuthUserCache();
        setIsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const isAuthenticated = lifecycle === "authenticated";

  const { data: user = null, isFetching } = useCurrentUserQuery({
    enabled: isReady && isAuthenticated,
  });

  useEffect(() => {
    return subscribeToAuthChanges((event) => {
      if (event === "logging_out" || event === "logout") {
        setLifecycle(
          event === "logging_out" ? "logging_out" : "unauthenticated",
        );
        void clearAuthUserCache();
        return;
      }

      if (event === "login" || event === "refresh") {
        setLifecycle("authenticated");
      }
    });
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const isRestoringUser =
      isReady && isAuthenticated && user === null && isFetching;

    return {
      user: isAuthenticated ? user : null,
      isAuthenticated: isAuthenticated && user !== null,
      isLoading: !isReady || isRestoringUser,
    };
  }, [isAuthenticated, isFetching, isReady, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
