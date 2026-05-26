export interface SuccessResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
}

export interface ServiceResponse<T> {
  message: string;
  data: T;
}
