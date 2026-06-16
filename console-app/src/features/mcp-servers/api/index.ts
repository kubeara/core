import { apiClient } from "@/api/axios";
import type {
    CreateMcpApiKeyRequest,
    CreateMcpApiKeyResult,
    McpApiKeyListItem,
    McpApiKeysApiResponse,
} from "../types";

function unwrapData<T>(response: McpApiKeysApiResponse<T>, fallback: string): T {
    const data = response.data;
    if (data === undefined || data === null) {
        throw new Error(fallback);
    }
    return data;
}

export async function createMcpApiKey(
    input: CreateMcpApiKeyRequest,
): Promise<CreateMcpApiKeyResult> {
    const response = await apiClient.post<McpApiKeysApiResponse<CreateMcpApiKeyResult>>(
        "/mcp-api-keys",
        input,
    );
    return unwrapData(response.data, "No token data in response");
}

export async function fetchMcpApiKeys(): Promise<McpApiKeyListItem[]> {
    const response = await apiClient.get<McpApiKeysApiResponse<McpApiKeyListItem[]>>(
        "/mcp-api-keys",
    );
    return unwrapData(response.data, "No MCP API keys in response");
}

export async function revokeMcpApiKey(keyId: string): Promise<string> {
    const response = await apiClient.delete<McpApiKeysApiResponse<null>>(
        `/mcp-api-keys/${encodeURIComponent(keyId)}`,
    );
    return response.data.message ?? "API key revoked";
}
