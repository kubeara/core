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
import { ErrorResponse } from "../interfaces/error-response.interface";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

const GENERIC_HTTP_ERRORS = new Set([
  "Bad Request",
  "Unauthorized",
  "Forbidden",
  "Not Found",
  "Conflict",
  "Unprocessable Entity",
  "Too Many Requests",
  "Internal Server Error",
]);

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
    let errorDetail: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      errorCode = this.statusToCode(status);

      const errorResponse = exception.getResponse();

      if (typeof errorResponse === "string") {
        message = errorResponse;
      } else if (isRecord(errorResponse)) {
        if ("message" in errorResponse) {
          const raw = errorResponse.message;
          message = Array.isArray(raw) ? raw.join(", ") : String(raw);
        }

        if (
          "errorCode" in errorResponse &&
          typeof errorResponse.errorCode === "string"
        ) {
          errorCode = errorResponse.errorCode;
        }

        if (typeof errorResponse.error === "string") {
          const candidate = errorResponse.error.trim();
          if (
            candidate &&
            !GENERIC_HTTP_ERRORS.has(candidate) &&
            candidate !== message
          ) {
            errorDetail = candidate;
          }
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      errorDetail = exception.message;
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

    const body: ErrorResponse = {
      success: false,
      statusCode: status,
      errorCode,
      message,
      ...(errorDetail ? { error: errorDetail } : {}),
    };

    response.status(status).json({
      ...body,
      ...(this.isDev &&
        exception instanceof Error && { stack: exception.stack }),
    });
  }

  /**
   * Code maps for error type status code
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
