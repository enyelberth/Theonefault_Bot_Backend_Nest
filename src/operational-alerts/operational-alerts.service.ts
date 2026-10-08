import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OperationalAlert, Prisma, PrismaClient } from '@prisma/client';
import axios from 'axios';

export type AlertSeverity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export interface EmitAlertInput {
  kind: string;
  severity?: AlertSeverity;
  subject: string;
  message: string;
  dedupeKey: string;
  botRunnerRunId?: number;
  payload?: Record<string, unknown>;
  cooldownMinutes?: number;
}

export interface ListAlertsFilters {
  severity?: AlertSeverity;
  kind?: string;
  onlyUnacknowledged?: boolean;
  botRunnerRunId?: number;
  limit?: number;
}

const DEFAULT_COOLDOWN_MINUTES = 30;

@Injectable()
export class OperationalAlertsService {
  private readonly logger = new Logger(OperationalAlertsService.name);

  constructor(private readonly prisma: PrismaClient) {}

  async emit(input: EmitAlertInput): Promise<OperationalAlert> {
    const severity = input.severity ?? 'INFO';
    const cooldownMs =
      (input.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES) * 60_000;
    const payload = input.payload
      ? (JSON.parse(JSON.stringify(input.payload)) as Prisma.InputJsonValue)
      : undefined;

    const existing = await this.prisma.operationalAlert.findUnique({
      where: { dedupeKey: input.dedupeKey },
    });

    if (existing) {
      const stillInCooldown =
        Date.now() - existing.lastOccurredAt.getTime() < cooldownMs;
      const alreadyAcknowledged = existing.acknowledgedAt !== null;
      const updated = await this.prisma.operationalAlert.update({
        where: { id: existing.id },
        data: {
          occurrenceCount: { increment: 1 },
          lastOccurredAt: new Date(),
          severity,
          subject: input.subject,
          message: input.message,
          payload,
          acknowledgedAt:
            alreadyAcknowledged && !stillInCooldown
              ? null
              : existing.acknowledgedAt,
          acknowledgedBy:
            alreadyAcknowledged && !stillInCooldown
              ? null
              : existing.acknowledgedBy,
        },
      });
      if (!stillInCooldown) {
        void this.dispatch(updated).catch((e) =>
          this.logger.warn(`dispatch failed: ${e.message}`),
        );
      }
      return updated;
    }

    const created = await this.prisma.operationalAlert.create({
      data: {
        kind: input.kind,
        severity,
        subject: input.subject,
        message: input.message,
        dedupeKey: input.dedupeKey,
        botRunnerRunId: input.botRunnerRunId,
        payload,
      },
    });
    void this.dispatch(created).catch((e) =>
      this.logger.warn(`dispatch failed: ${e.message}`),
    );
    return created;
  }

  async list(filters: ListAlertsFilters = {}): Promise<OperationalAlert[]> {
    return this.prisma.operationalAlert.findMany({
      where: {
        severity: filters.severity,
        kind: filters.kind,
        botRunnerRunId: filters.botRunnerRunId,
        acknowledgedAt: filters.onlyUnacknowledged ? null : undefined,
      },
      orderBy: [{ lastOccurredAt: 'desc' }, { id: 'desc' }],
      take: Math.min(filters.limit ?? 50, 500),
    });
  }

  async acknowledge(
    id: number,
    acknowledgedBy?: string,
  ): Promise<OperationalAlert> {
    const alert = await this.prisma.operationalAlert.findUnique({
      where: { id },
    });
    if (!alert) throw new NotFoundException(`OperationalAlert ${id} not found`);
    if (alert.acknowledgedAt) return alert;
    return this.prisma.operationalAlert.update({
      where: { id },
      data: { acknowledgedAt: new Date(), acknowledgedBy },
    });
  }

  private async dispatch(alert: OperationalAlert): Promise<void> {
    const token = process.env.TELEGRAM_ALERT_BOT_TOKEN?.trim();
    const chatId = process.env.TELEGRAM_ALERT_CHAT_ID?.trim();
    if (!token || !chatId) return;
    const emoji = this.severityEmoji(alert.severity as AlertSeverity);
    const text =
      `${emoji} <b>${alert.severity}</b> · <code>${alert.kind}</code>\n` +
      `<b>${alert.subject}</b>\n${alert.message}` +
      (alert.occurrenceCount > 1
        ? `\n<i>occurrence ${alert.occurrenceCount}</i>`
        : '');
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
  }

  private severityEmoji(severity: AlertSeverity): string {
    switch (severity) {
      case 'CRITICAL':
        return '🚨';
      case 'ERROR':
        return '❗';
      case 'WARN':
        return '⚠️';
      default:
        return 'ℹ️';
    }
  }
}
