import { Module } from '@nestjs/common';
import { CryptoGuardService } from './crypto-guard.service';
import { CryptoGuardGateway } from './crypto-guard.gateway';
import { RiskAlertGateway } from './risk-alert.gateway';
import { AccountModule } from '../account/account.module';
import { BotModule } from '../bot/bot.module';
import { BinanceModule } from '../binance/binance.module';
import { StrategyMonitoringModule } from '../strategy-monitoring/strategy-monitoring.module';

@Module({
  imports: [AccountModule, BotModule, BinanceModule, StrategyMonitoringModule],
  providers: [CryptoGuardGateway, RiskAlertGateway, CryptoGuardService],
})
export class CryptoGuardModule {}
