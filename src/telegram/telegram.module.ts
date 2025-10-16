import { Module } from '@nestjs/common';
import { BotTelegramController } from './bot-telegram.controller';
import { BotTelegramService } from './bot-telegram.service';
import { CryptoPriceModule } from '../crypto-price/crypto-price.module'; // Importa el módulo, no el servicio

@Module({
  imports: [CryptoPriceModule], // Aquí se importan módulos
  controllers: [BotTelegramController],
  providers: [BotTelegramService],
  exports: [BotTelegramService],
})
export class TelegramBotModule {}
