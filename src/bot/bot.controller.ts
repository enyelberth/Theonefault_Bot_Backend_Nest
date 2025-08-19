import { Controller, Post, Body, Delete, Param, Get } from '@nestjs/common';
import { BotService } from './bot.service';

@Controller('bot')
export class BotController {
  constructor(private readonly botService: BotService) {}

  // Iniciar un bot con la configuración enviada
  @Post('start')
  async startBot(@Body() body: { symbol: string; strategyType: string; config: any }) {
    await this.botService.startStrategy(body.symbol, body.strategyType, body.config);
    return { message: `Bot iniciado para ${body.symbol} con estrategia ${body.strategyType}` };
  }

  // Parar un bot activo
  @Delete('stop/:symbol')
  async stopBot(@Param('symbol') symbol: string) {
    await this.botService.stopStrategy(symbol);
    return { message: `Bot detenido para ${symbol}` };
  }

  // Listar bots activos
  @Get('active')
  getActiveBots() {
      return this.botService.getActiveBots();
  }
}
