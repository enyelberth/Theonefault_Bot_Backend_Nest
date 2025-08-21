import { Controller, Post, Body, Delete, Param, Get } from '@nestjs/common';
import { BotService } from './bot.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';

@ApiTags('bot')
@Controller('bot')
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Post('start')
  @ApiOperation({ summary: 'Iniciar un bot con la configuración enviada' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', example: 'BTCUSDT' },
        strategyType: { type: 'string', example: 'scalping' },
        config: { type: 'object', example: { param1: 'value1', param2: 10 } },
      },
      required: ['symbol', 'strategyType', 'config'],
    },
  })
  @ApiResponse({ status: 201, description: 'Bot iniciado correctamente.' })
  async startBot(@Body() body: { symbol: string; strategyType: string; config: any }) {
    await this.botService.startStrategy(body.symbol, body.strategyType, body.config);
    return { message: `Bot iniciado para ${body.symbol} con estrategia ${body.strategyType}` };
  }

  @Delete('stop/:symbol')
  @ApiOperation({ summary: 'Parar un bot activo' })
  @ApiParam({ name: 'symbol', required: true, description: 'Símbolo del bot a detener', example: 'BTCUSDT' })
  @ApiResponse({ status: 200, description: 'Bot detenido correctamente.' })
  async stopBot(@Param('symbol') symbol: string) {
    await this.botService.stopStrategy(symbol);
    return { message: `Bot detenido para ${symbol}` };
  }

  @Get('active')
  @ApiOperation({ summary: 'Listar bots activos' })
  @ApiResponse({ status: 200, description: 'Lista de bots activos.' })
  getActiveBots() {
    return this.botService.getActiveBots();
  }
}
