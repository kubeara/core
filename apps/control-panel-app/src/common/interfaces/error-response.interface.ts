export interface ErrorResponse {
  success: false;
  statusCode: number;
  errorCode: string;
  message: string;
  error?: string;
  retryAfterSeconds?: number;
}
