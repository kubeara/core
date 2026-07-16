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
    let retryAfterSeconds: number | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      errorCode = this.statusToCode(status);

      const errorResponse = exception.getResponse();

      if (typeof errorResponse === "string") {
        message = errorResponse;
      } else if (errorResponse && typeof errorResponse === "object") {
        const body = errorResponse as Record<string, unknown>;

        if (body.message !== undefined) {
          const raw = body.message;

          if (Array.isArray(raw)) {
            message = raw.map(String).join(", ");
          } else if (
            typeof raw === "string" ||
            typeof raw === "number" ||
            typeof raw === "boolean"
          ) {
            message = String(raw);
          }
        }

        if (typeof body.errorCode === "string") {
          errorCode = body.errorCode;
        }

        if (
          typeof body.retryAfterSeconds === "number" &&
          Number.isFinite(body.retryAfterSeconds) &&
          body.retryAfterSeconds > 0
        ) {
          retryAfterSeconds = Math.ceil(body.retryAfterSeconds);
        }

        if (typeof body.error === "string") {
          const candidate = body.error.trim();
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
      ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
    };

    response.status(status).json({
      ...body,
      ...(this.isDev &&
        exception instanceof Error && { stack: exception.stack }),
    });
  }

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
