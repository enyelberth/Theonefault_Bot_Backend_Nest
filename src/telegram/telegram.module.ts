import { Module } from '@nestjs/common';
import { BotTelegramController } from './bot-telegram.controller';
import { BotTelegramService } from './bot-telegram.service';
import { CryptoPriceModule } from '../crypto-price/crypto-price.module';
import { BotModule } from 'src/bot/bot.module';
import { AlertModule } from 'src/alert/alert.module';
import { TradingModule } from 'src/trading/trading.module';
import { AccountModule } from 'src/account/account.module';
import { BinanceModule } from 'src/binance/binance.module';
import { PnlLedgerModule } from 'src/pnl-ledger/pnl-ledger.module';

@Module({
  imports: [
    CryptoPriceModule,
    BotModule,
    AlertModule,
    TradingModule,
    AccountModule,
    BinanceModule,
    PnlLedgerModule,
  ],
  controllers: [BotTelegramController],
  providers: [BotTelegramService],
  exports: [BotTelegramService],
})
export class TelegramBotModule {}
