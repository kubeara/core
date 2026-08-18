export type AppErrorItem = {
  id: string;
  message: string;
  createdAt: number;
  /** Stable key of a recurring error source, e.g. a specific server. */
  source?: string;
};

export type AppErrorInput = Pick<AppErrorItem, "message" | "source">;
