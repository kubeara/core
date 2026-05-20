export interface ExecuteResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    executionTimeMs: number;
}
