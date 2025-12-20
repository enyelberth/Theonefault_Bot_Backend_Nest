import { Module } from '@nestjs/common';

import { GeminisController } from './geminis.controller';
import { GeminiService } from './geminis.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [GeminisController],
  providers: [GeminiService],
  exports:[GeminiService]
})
export class GeminisModule {}
