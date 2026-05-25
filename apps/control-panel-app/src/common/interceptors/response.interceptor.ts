import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Response } from "express";
import { map, Observable } from "rxjs";

export interface SuccessResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
}

interface ServiceResponse<T> {
  message: string;
  data: T;
}

function isServiceResponse<T>(value: unknown): value is ServiceResponse<T> {
  return (
    value !== null &&
    typeof value === "object" &&
    "message" in value &&
    "data" in value &&
    typeof (value as ServiceResponse<T>).message === "string"
  );
}

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
        if (isServiceResponse<T>(data)) {
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
          message: "Request successful",
          data: data,
        };
      }),
    );
  }
}
