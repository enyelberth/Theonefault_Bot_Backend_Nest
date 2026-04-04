import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { ObservabilityService } from './observability.service';

@Injectable()
export class StructuredLoggingInterceptor implements NestInterceptor {
  constructor(private readonly observability: ObservabilityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const startedAt = Date.now();
    const method = request?.method ?? 'UNKNOWN';
    const route = request?.route?.path ?? request?.url ?? 'unknown';
    const correlationId = request?.correlationId ?? request?.headers?.['x-correlation-id'] ?? 'n/a';

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startedAt;
          this.observability.trackRequest(route, durationMs, false);
          console.log(JSON.stringify({
            level: 'info',
            type: 'http_request',
            method,
            route,
            statusCode: response?.statusCode,
            durationMs,
            correlationId,
            timestamp: new Date().toISOString(),
          }));
        },
        error: (error: unknown) => {
          const durationMs = Date.now() - startedAt;
          this.observability.trackRequest(route, durationMs, true);
          console.error(JSON.stringify({
            level: 'error',
            type: 'http_request',
            method,
            route,
            statusCode: response?.statusCode,
            durationMs,
            correlationId,
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
          }));
        },
      }),
    );
  }
}
