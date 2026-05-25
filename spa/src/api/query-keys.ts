export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
  },
  servers: {
    all: ["servers"] as const,
    detail: (id: string) => ["servers", id] as const,
  },
} as const;
