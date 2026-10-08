import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, finalize } from 'rxjs/operators';
import { randomUUID } from 'crypto';
import { AuditService } from './audit.service';

const firstHeader = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return value[0] ? String(value[0]) : undefined;
  return value == null ? undefined : String(value);
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const request = http.getRequest<any>();
    const response = http.getResponse<any>();
    const startedAt = Date.now();
    const requestId = (
      firstHeader(request.headers?.['x-request-id']) || randomUUID()
    ).slice(0, 80);
    const path = String(
      request.path || request.url?.split('?')[0] || 'unknown',
    );
    const rawUserId = Number(request.user?.sub);
    const userId =
      Number.isInteger(rawUserId) && rawUserId > 0 ? rawUserId : undefined;
    const forwardedFor = firstHeader(request.headers?.['x-forwarded-for']);
    const ipAddress = (
      forwardedFor?.split(',')[0]?.trim() ||
      request.ip ||
      request.socket?.remoteAddress
    )?.slice(0, 128);
    const userAgent = firstHeader(request.headers?.['user-agent'])?.slice(
      0,
      512,
    );
    const metadata = {
      queryKeys: Object.keys(request.query || {}).slice(0, 50),
      hasBody: Boolean(
        request.body &&
          typeof request.body === 'object' &&
          Object.keys(request.body).length,
      ),
      contentLength: firstHeader(request.headers?.['content-length']) || null,
    };
    let errorStatus: number | undefined;
    response.setHeader('x-request-id', requestId);

    return next.handle().pipe(
      catchError((error) => {
        errorStatus = Number.isInteger(Number(error?.status))
          ? Number(error.status)
          : 500;
        throw error;
      }),
      finalize(() => {
        void this.audit
          .record({
            requestId,
            userId,
            method: String(request.method || 'UNKNOWN'),
            path,
            statusCode: errorStatus || Number(response.statusCode) || 200,
            durationMs: Date.now() - startedAt,
            ipAddress,
            userAgent,
            metadata: errorStatus ? { ...metadata, errorStatus } : metadata,
          })
          .catch(() => undefined);
      }),
    );
  }
}
