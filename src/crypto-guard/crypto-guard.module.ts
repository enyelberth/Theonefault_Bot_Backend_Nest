import { Module } from '@nestjs/common';
import { CryptoGuardService } from './crypto-guard.service';
import { CryptoGuardGateway } from './crypto-guard.gateway';
import { AccountModule } from 'src/account/account.module';
import { BotModule } from 'src/bot/bot.module';
import { BinanceModule } from 'src/binance/binance.module';

@Module({
  imports: [AccountModule, BotModule, BinanceModule],
  providers: [CryptoGuardGateway, CryptoGuardService],
})
export class CryptoGuardModule {}
