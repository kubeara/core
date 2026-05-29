/**
 * Organization entity
 */
export type Organization = {
    id: string;
    name: string;
};

/**
 * User entity
 */
export type User = {
    id: string;
    email: string;
    name: string;
    organizationId: string;
    organization?: Organization;
    status?: string;
    isEmailVerified?: boolean;
    emailVerifiedAt?: number;
    lastLoginAt?: number;
    signUpAt?: number;
    createdAt?: string;
    updatedAt?: string;
};

/**
 * Template entity
 */
export type Template = {
    id: string;
    name: string;
    description: string;
    category: string;
    color: string;
};

/**
 * Server entity
 */
export type Server = {
    id: string;
    name: string;
    username: string;
    host: string;
    connected: boolean;
    lastConnectedAt: string | null;
    createdAt: string;
};
