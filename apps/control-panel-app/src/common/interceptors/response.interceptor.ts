import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Response } from "express";
import { map, Observable } from "rxjs";
import {
  ServiceResponse,
  SuccessResponse,
} from "../interfaces/success-response.interface";
import { throwIfFailurePayload } from "../utils/failure-payload.util";

function isServiceResponse<T>(value: unknown): value is ServiceResponse<T> {
  return (
    value !== null &&
    typeof value === "object" &&
    "message" in value &&
    "data" in value &&
    typeof (value as ServiceResponse<T>).message === "string"
  );
}

/**
 * Wraps successful controller/service responses in a standard envelope.
 * Legacy `{ success: false }` payloads are rejected as HTTP errors.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  SuccessResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        throwIfFailurePayload(data);

        if (isServiceResponse<T>(data)) {
          throwIfFailurePayload(data.data);

          return {
            success: true as const,
            statusCode: response.statusCode,
            message: data.message,
            data: data.data,
          };
        }

        return {
          success: true as const,
          statusCode: response.statusCode,
          message: "Request completed successfully",
          data: data,
        };
      }),
    );
  }
}
