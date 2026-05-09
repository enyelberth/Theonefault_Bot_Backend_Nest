import { Module } from '@nestjs/common';
import { TelegramSofiaService } from './telegram-sofia.service';
import { TelegramSofiaGateway } from './telegram-sofia.gateway';
import { GeminisModule } from 'src/geminis/geminis.module';

@Module({
  imports: [GeminisModule],
  providers: [TelegramSofiaGateway, TelegramSofiaService],
})
export class TelegramSofiaModule {}
