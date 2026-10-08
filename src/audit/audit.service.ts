import { Injectable } from '@nestjs/common';
import { AuditEvent, Prisma, PrismaClient } from '@prisma/client';

export interface RecordAuditEventInput {
  requestId: string;
  eventType?: string;
  userId?: number;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface ListAuditEventsFilters {
  requestId?: string;
  userId?: number;
  path?: string;
  statusCode?: number;
  from?: Date;
  to?: Date;
  limit?: number;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async record(input: RecordAuditEventInput): Promise<AuditEvent> {
    const metadata = input.metadata
      ? (JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue)
      : undefined;

    return this.prisma.auditEvent.create({
      data: {
        requestId: input.requestId.slice(0, 80),
        eventType: (input.eventType ?? 'HTTP_REQUEST').slice(0, 64),
        userId: input.userId,
        method: input.method.slice(0, 12),
        path: input.path.slice(0, 512),
        statusCode: Math.max(0, Math.trunc(input.statusCode)),
        durationMs: Math.max(0, Math.trunc(input.durationMs)),
        ipAddress: input.ipAddress?.slice(0, 128),
        userAgent: input.userAgent?.slice(0, 512),
        metadata,
      },
    });
  }

  list(filters: ListAuditEventsFilters = {}): Promise<AuditEvent[]> {
    return this.prisma.auditEvent.findMany({
      where: {
        requestId: filters.requestId,
        userId: filters.userId,
        path: filters.path ? { contains: filters.path } : undefined,
        statusCode: filters.statusCode,
        createdAt:
          filters.from || filters.to
            ? { gte: filters.from, lte: filters.to }
            : undefined,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.min(filters.limit ?? 100, 500),
    });
  }

  async summary(hours = 24) {
    const safeHours = Math.min(Math.max(Math.trunc(hours), 1), 168);
    const from = new Date(Date.now() - safeHours * 60 * 60 * 1000);
    const where = { createdAt: { gte: from } };
    const [total, failures, aggregate, byStatus] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.count({
        where: { ...where, statusCode: { gte: 400 } },
      }),
      this.prisma.auditEvent.aggregate({ where, _avg: { durationMs: true } }),
      this.prisma.auditEvent.groupBy({
        by: ['statusCode'],
        where,
        _count: { _all: true },
        orderBy: { statusCode: 'asc' },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      hours: safeHours,
      from,
      total,
      failures,
      errorRatePct: total ? Number(((failures / total) * 100).toFixed(2)) : 0,
      averageDurationMs:
        aggregate._avg.durationMs == null
          ? 0
          : Number(aggregate._avg.durationMs.toFixed(2)),
      byStatus: byStatus.map((item) => ({
        statusCode: item.statusCode,
        count: item._count._all,
      })),
    };
  }
}
