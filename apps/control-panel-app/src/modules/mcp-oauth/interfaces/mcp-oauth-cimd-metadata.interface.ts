export interface McpOAuthCimdMetadata {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  token_endpoint_auth_method?: string;
}
