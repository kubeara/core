export interface ErrorResponse {
  success: false;
  statusCode: number;
  message: string | string[];
  path?: string;
  error?: string;
}
