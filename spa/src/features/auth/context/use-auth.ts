import { createContext, useContext } from "react";
import type { User } from "@/types";

export type AuthContextValue = {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);

    if (!ctx) {
        throw new Error("useAuth must be used within AuthProvider");
    }

    return ctx;
}