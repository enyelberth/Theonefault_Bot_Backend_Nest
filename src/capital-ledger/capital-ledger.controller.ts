import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import {
  CapitalEventType,
  CapitalLedgerService,
  LedgerFilters,
} from './capital-ledger.service';
import { WalletSyncService } from './wallet-sync.service';

const TYPES: CapitalEventType[] = [
  'TRADE_PNL',
  'FEE',
  'FUNDING',
  'INTEREST',
  'REBATE',
  'DEPOSIT',
  'WITHDRAWAL',
  'ADJUSTMENT',
];

@ApiTags('capital-ledger')
@Controller('analytics/capital-ledger')
export class CapitalLedgerController {
  constructor(
    private readonly ledger: CapitalLedgerService,
    private readonly walletSync: WalletSyncService,
    private readonly prisma: PrismaClient,
  ) {}

  @Post('sync-now')
  @ApiOperation({
    summary:
      'Trigger manual del wallet sync (interest/deposits/withdrawals/rebates)',
  })
  async syncNow() {
    return {
      triggeredAt: new Date().toISOString(),
      ...(await this.walletSync.syncAll()),
    };
  }

  @Get('sync-status')
  @ApiOperation({ summary: 'Último occurredAt registrado por type/source' })
  async syncStatus() {
    const types = [
      'TRADE_PNL',
      'FEE',
      'INTEREST',
      'DEPOSIT',
      'WITHDRAWAL',
      'REBATE',
      'FUNDING',
    ];
    const rows = await Promise.all(
      types.map(async (type) => {
        const last = await this.prisma.capitalEvent.findFirst({
          where: { type },
          orderBy: { occurredAt: 'desc' },
          select: { occurredAt: true, source: true },
        });
        const count = await this.prisma.capitalEvent.count({ where: { type } });
        return {
          type,
          count,
          lastOccurredAt: last?.occurredAt?.toISOString() ?? null,
          lastSource: last?.source ?? null,
        };
      }),
    );
    return { generatedAt: new Date().toISOString(), types: rows };
  }

  @Get('summary')
  @ApiOperation({ summary: 'Totales por type + currency' })
  @ApiQuery({ name: 'type', required: false, enum: TYPES })
  @ApiQuery({ name: 'botRunnerRunId', required: false, type: 'number' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'currency', required: false })
  summary(
    @Query('type') type?: string,
    @Query('botRunnerRunId') runId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('currency') currency?: string,
  ) {
    return this.ledger.summaryByType(
      this.parseFilters({ type, runId, from, to, currency }),
    );
  }

  @Get('daily')
  @ApiOperation({ summary: 'Totales diarios (gains vs losses)' })
  daily(
    @Query('type') type?: string,
    @Query('botRunnerRunId') runId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('currency') currency?: string,
  ) {
    return this.ledger.dailyTotals(
      this.parseFilters({ type, runId, from, to, currency }),
    );
  }

  @Get('roi')
  @ApiOperation({ summary: 'ROI real: netReturn / netCapital' })
  @ApiQuery({ name: 'currency', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'botRunnerRunId', required: false, type: 'number' })
  roi(
    @Query('currency') currency?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('botRunnerRunId') runId?: string,
  ) {
    return this.ledger.roi(this.parseFilters({ currency, from, to, runId }));
  }

  @Get()
  @ApiOperation({ summary: 'Lista eventos con paginación' })
  list(
    @Query('type') type?: string,
    @Query('botRunnerRunId') runId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('currency') currency?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const filters = this.parseFilters({ type, runId, from, to, currency });
    return this.ledger.list({
      ...filters,
      limit: limit === undefined ? 100 : Number(limit),
      offset: offset === undefined ? 0 : Number(offset),
    });
  }

  private parseFilters(q: {
    type?: string;
    runId?: string;
    from?: string;
    to?: string;
    currency?: string;
  }): LedgerFilters {
    const filters: LedgerFilters = {};
    if (q.type) {
      if (!TYPES.includes(q.type as CapitalEventType)) {
        throw new BadRequestException(
          `type must be one of ${TYPES.join(', ')}`,
        );
      }
      filters.type = q.type as CapitalEventType;
    }
    if (q.runId !== undefined) {
      const n = Number(q.runId);
      if (!Number.isInteger(n) || n <= 0) {
        throw new BadRequestException(
          'botRunnerRunId must be positive integer',
        );
      }
      filters.botRunnerRunId = n;
    }
    if (q.from) {
      const d = new Date(q.from);
      if (Number.isNaN(d.getTime()))
        throw new BadRequestException('from invalid');
      filters.from = d;
    }
    if (q.to) {
      const d = new Date(q.to);
      if (Number.isNaN(d.getTime()))
        throw new BadRequestException('to invalid');
      filters.to = d;
    }
    if (q.currency) filters.currency = q.currency.trim().toUpperCase();
    return filters;
  }
}
