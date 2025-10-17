import { Module } from '@nestjs/common';
import { BotTelegramController } from './bot-telegram.controller';
import { BotTelegramService } from './bot-telegram.service';
import { CryptoPriceModule } from '../crypto-price/crypto-price.module'; // Importa el módulo, no el servicio
import { AccountService } from 'src/account/account.service';
import { BinanceService } from 'src/binance/binance.service';
import { PrismaClient } from '@prisma/client';
import { BotService } from 'src/bot/bot.service';
import { CryptoPairService } from 'src/crypto-pair/crypto-pair.service';
import { CryptoPriceService } from 'src/crypto-price/crypto-price.service';
import { ProfileService } from 'src/profile/profile.service';
import { TradingService } from 'src/trading/trading.service';

@Module({
  imports: [CryptoPriceModule], // Aquí se importan módulos
  controllers: [BotTelegramController],
  providers: [BotTelegramService, AccountService,BinanceService,PrismaClient,CryptoPairService,CryptoPriceService,ProfileService,TradingService],
  exports: [BotTelegramService],
})
export class TelegramBotModule {}
