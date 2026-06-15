import type { ChildProcess } from "child_process";

export interface ContainerLogSession {
  sessionId: string;
  containerId: string;
  child: ChildProcess;
  stopping: boolean;
  stderr: string;
}
