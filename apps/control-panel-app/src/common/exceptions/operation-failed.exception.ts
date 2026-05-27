import { HttpException, HttpStatus } from "@nestjs/common";

export interface OperationFailedExceptionBody {
  message: string;
  error: string;
  errorCode?: string;
  step?: string;
  logs?: string[];
}

export class OperationFailedException extends HttpException {
  constructor(
    message: string,
    error: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    options?: {
      errorCode?: string;
      step?: string;
      logs?: string[];
    },
  ) {
    const body: OperationFailedExceptionBody = {
      message,
      error,
      ...(options?.errorCode ? { errorCode: options.errorCode } : {}),
      ...(options?.step ? { step: options.step } : {}),
      ...(options?.logs ? { logs: options.logs } : {}),
    };

    super(body, status);
  }
}
