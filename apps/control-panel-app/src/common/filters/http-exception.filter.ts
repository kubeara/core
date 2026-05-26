import { NODE_ENV } from "@control-panel/constants/env.constant";
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private readonly isDev = process.env.NODE_ENV !== NODE_ENV.PRODUCTION;

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let errorCode = "INTERNAL_SERVER_ERROR";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      errorCode = this.statusToCode(status);

      const errorResponse = exception.getResponse();

      if (typeof errorResponse === "string") {
        message = errorResponse;
      } else if (typeof errorResponse === "object" && errorResponse) {
        const res = errorResponse as Record<string, unknown>;

        if ("message" in res) {
          const raw = res.message;
          message = Array.isArray(raw) ? raw.join(", ") : String(raw);
        }

        if ("errorCode" in res && typeof res.errorCode === "string") {
          errorCode = res.errorCode;
        }
      }
    }

    const logContext = `[${request.method}] ${request.url} → ${status}`;
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        logContext,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${logContext}: ${message}`);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      errorCode,
      message,
      ...(this.isDev &&
        exception instanceof Error && { stack: exception.stack }),
    });
  }

  /**
   * Code maps for error type status code
   * @param status
   * @returns
   */
  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: "BAD_REQUEST",
      401: "UNAUTHORIZED",
      403: "FORBIDDEN",
      404: "NOT_FOUND",
      409: "CONFLICT",
      422: "UNPROCESSABLE_ENTITY",
      429: "TOO_MANY_REQUESTS",
      500: "INTERNAL_SERVER_ERROR",
    };
    return map[status] ?? "UNKNOWN_ERROR";
  }
}
