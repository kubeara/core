import { HttpException, HttpStatus } from "@nestjs/common";

export class OperationFailedException extends HttpException {
  constructor(
    message: string,
    error: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    options?: { errorCode?: string },
  ) {
    super(
      {
        message,
        error,
        ...(options?.errorCode ? { errorCode: options.errorCode } : {}),
      },
      status,
    );
  }
}
