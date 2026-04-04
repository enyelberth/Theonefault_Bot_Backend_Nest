import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.headers['x-correlation-id'];
    const correlationId = typeof incoming === 'string' && incoming.trim() !== ''
      ? incoming
      : randomUUID();

    (req as Request & { correlationId?: string }).correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    next();
  }
}
