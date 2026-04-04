import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY, RateLimitRule } from './rate-limit.decorator';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, number[]>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<RateLimitRule>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!rule) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request?.user?.sub ?? 'anonymous';
    const route = request?.route?.path ?? request?.url ?? 'unknown';
    const ip = request?.ip ?? 'unknown';
    const bucketKey = `${route}:${userId}:${ip}`;

    const now = Date.now();
    const windowStart = now - rule.windowMs;
    const events = (this.buckets.get(bucketKey) ?? []).filter(ts => ts >= windowStart);

    if (events.length >= rule.limit) {
      throw new HttpException(
        `Límite excedido para esta operación. Intenta de nuevo en ${Math.ceil(rule.windowMs / 1000)}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    events.push(now);
    this.buckets.set(bucketKey, events);
    return true;
  }
}
