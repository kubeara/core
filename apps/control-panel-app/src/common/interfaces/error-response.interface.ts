export interface ErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  error?: string;
  errorCode?: string;
  path?: string;
}
