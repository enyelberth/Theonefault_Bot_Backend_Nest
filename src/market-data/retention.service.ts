import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarketDataService } from './market-data.service';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly marketData: MarketDataService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async prune() {
    try {
      const result = await this.marketData.pruneOldData({
        priceRetentionDays: 30,
        candleRetentionDays: {
          '1m': 7,
          '5m': 30,
          '15m': 90,
          '1h': 365,
        },
      });
      this.logger.log(
        `Retention run: ${result.prices} prices, ${result.candles} candles removed`,
      );
    } catch (err) {
      this.logger.error('Retention job failed', err as Error);
    }
  }
}
