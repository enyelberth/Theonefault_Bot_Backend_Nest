import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class CapitalGuardResetService {
  private readonly logger = new Logger(CapitalGuardResetService.name);

  constructor(private readonly prisma: PrismaClient) {}

  @Cron('0 0 * * *', { timeZone: 'UTC' })
  async resetDailyLossKillSwitches(): Promise<void> {
    const result = await this.prisma.killSwitch.updateMany({
      where: {
        scope: 'BOT',
        enabled: true,
        triggeredBy: 'CAPITAL_GUARD',
        reason: { contains: 'daily loss' },
      },
      data: { enabled: false, triggeredAt: null },
    });
    if (result.count > 0) {
      this.logger.log(
        `daily reset: unlocked ${result.count} kill-switches (daily-loss cause)`,
      );
    }
  }
}
