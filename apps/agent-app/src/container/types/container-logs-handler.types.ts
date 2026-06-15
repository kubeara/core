export type ContainerLogsDataHandler = (
  sessionId: string,
  data: string,
) => void;

export type ContainerLogsErrorHandler = (
  sessionId: string,
  error: string,
) => void;

export type ContainerLogsCloseHandler = (sessionId: string) => void;
