/**
 * Shared Types
 */

export interface Agent {
    id: string;
    name?: string;
    status: 'connected' | 'disconnected';
    lastSeen: Date;
}

export interface Template {
    slug: string;
    name: string;
    description?: string;
    category?: string;
    tags?: string[];
    version?: string;
}

export interface Deployment {
    id: string;
    templateSlug: string;
    agentId: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
}
