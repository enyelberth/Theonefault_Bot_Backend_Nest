import { Controller, Post, Body, Delete, Param, Get, UseGuards } from '@nestjs/common';
import { BotService } from './bot.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard, Public } from 'src/authA/auth.guard';
import { json } from 'stream/consumers';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)

@ApiTags('bot')
@Controller('bot')
export class BotController {
  constructor(private readonly botService: BotService) { }
  @Public()
  @Post('start')
  @ApiOperation({ summary: 'Iniciar un bot con la configuración enviada' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        typeId: { type: 'number', example: 1 },
        symbol: { type: 'string', example: 'BTCUSDT' },
        strategyType: { type: 'string', example: 'scalping' },
        config: { type: 'object', example: { param1: 'value1', param2: 10 } },
      },
      required: ['symbol', 'strategyType', 'config'],
    },
  })
  @ApiResponse({ status: 201, description: 'Bot iniciado correctamente.' })
  async startBot(@Body() body: { symbol: string; typeId: number; strategyType: string; config: any }) {
    await this.botService.startStrategy(body.symbol, body.typeId, body.strategyType, body.config);
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
  @Get('otro')
  @ApiOperation({ summary: 'Listar bots activos' })
  @ApiResponse({ status: 200, description: 'Lista de bots activos.' })
  getActiveBotsaaa() {
    return this.botService.getActiveBotsData();
  }
  @Get('InfoBotsComplet')
  @ApiOperation({ summary: 'Listar informacion bots' })
  @ApiResponse({ status: 200, description: 'Lista toda la informacion de los bots' })
  getBotActiveInfo() {
    const data = this.botService.getBotss();

    console.log(data)


    interface Order {
      orderId: number;
      price: string;
      origQty: string;
      timestamp: number;
    }


    const nuevoArray = data.map((bot, index) => ({
      symbol: bot.symbol,
      config: {
        config: (bot.strategy as any)?.config,
        openSellOrders: Object.values((bot.strategy as any)?.openSellOrders ?? {}),
        isRunning: (bot.strategy as any)?.isRunning ?? false,
        skippedLevels: (bot.strategy as any)?.skippedLevels ?? {},
        profitLoss: (bot.strategy as any)?.profitLoss ?? 0,
        logger: (bot.strategy as any)?.logger ?? null,
      },
    }));

    const resultado: { [key: number]: any } = {};
    const orderSellarray: { [key: number]: any } = {};
        const skippedLevelsarray: { [key: number]: any } = {};

    nuevoArray.forEach((botNuevo, index) => {
      const estrategia = data[index].strategy as any;

      if (estrategia && estrategia.openBuyOrders instanceof Map) {
        resultado[index] = Array.from(estrategia.openBuyOrders.values()).map((order: any) => ({
          orderId: order.orderId,
          price: order.price,
          origQty: order.origQty,
          timestamp: order.timestamp,
        }));
      }
      if (estrategia && estrategia.openSellOrders instanceof Map) {
        orderSellarray[index] = Array.from(estrategia.openSellOrders.values()).map((order: any) => ({
          orderId: order.orderId,
          price: order.price,
          origQty: order.origQty,
          timestamp: order.timestamp,
          isSell: order.isSell
        }));
      }
      if (estrategia && estrategia.skippedLevels instanceof Map) {
        skippedLevelsarray[index] = Array.from(estrategia.skippedLevels.values()).map((order: any) => ({
           "level":order
        }));
      }
    });
    const nuevoArray2 = data.map((bot, index) => ({
      symbol: bot.symbol,
      config: {
        config: (bot.strategy as any)?.config,
        openBuyOrders: resultado[index],
        openSellOrders: orderSellarray[index],
        isRunning: (bot.strategy as any)?.isRunning ?? false,
        skippedLevels: skippedLevelsarray[index],
        profitLoss: (bot.strategy as any)?.profitLoss ?? 0,
        logger: (bot.strategy as any)?.logger ?? null,
      },
    }));





    return nuevoArray2;
  }

}
