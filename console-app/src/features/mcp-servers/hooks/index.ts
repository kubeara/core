import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getErrorMessage, toApiError } from "@/api/api-error";
import { QUERY_KEYS } from "@/constants/query-keys";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import {
  createMcpApiKey,
  fetchMcpApiKeys,
  revokeMcpApiKey,
} from "../api";
import type {
  CreateMcpApiKeyRequest,
  CreateMcpApiKeyResult,
} from "../types";

function withMcpMutationError<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
): (variables: TVariables) => Promise<TData> {
  return async (variables: TVariables) => {
    try {
      return await mutationFn(variables);
    } catch (error) {
      throw toApiError(error);
    }
  };
}

export function useMcpApiKeysQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.mcpApiKeys.all,
    queryFn: fetchMcpApiKeys,
  });
}

export function useCreateMcpApiKeyMutation() {
  const queryClient = useQueryClient();

  return useMutation<CreateMcpApiKeyResult, ApiError, CreateMcpApiKeyRequest>({
    mutationFn: withMcpMutationError(createMcpApiKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mcpApiKeys.all });
    },
  });
}

export function useRevokeMcpApiKeyMutation() {
  const queryClient = useQueryClient();

  return useMutation<string, ApiError, string>({
    mutationFn: withMcpMutationError(revokeMcpApiKey),
    onSuccess: (message) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mcpApiKeys.all });
      showSuccessToast(message);
    },
    onError: (error) => {
      showErrorToast(getErrorMessage(error));
    },
  });
}
