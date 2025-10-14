import { Controller, Post, Body,Patch, Delete, Param, Get, UseGuards } from '@nestjs/common';
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
  async startBot(@Body() body: { symbol: string; id: string; typeId: number; strategyType: string; config: any }) {
   //console.log(body.symbol)
    console.log(body.id);
    await this.botService.startStrategy(body.symbol, body.typeId, body.strategyType, body.config, body.id);
    return { message: `Bot iniciado para ${body.symbol} con estrategia ${body.strategyType}` };
  }

  @Delete('stop/:id')
  @ApiOperation({ summary: 'Parar un bot activo' })
  @ApiParam({ name: 'id', required: true, description: 'Símbolo del bot a detener', example: 'BTCUSDT' })
  @ApiResponse({ status: 200, description: 'Bot detenido correctamente.' })
  async stopBot(@Param('id') id: string) {
   // console.log(`Deteniendo bot con id: ${id}`);
    await this.botService.stopStrategy(id);
    return { message: `Bot detenido para ${id}` };
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
          "level": order
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
  @Get('data')
  @ApiOperation({ summary: 'Listar datos detallados de bots activos' })
  @ApiResponse({ status: 200, description: 'Lista datos de bots activos.' })
  getActiveBotsData() {
    return this.botService.getActiveBotsData();
  }

  // Nuevas rutas para modificar estrategia en ejecución

  @Patch('profitMargin/:id')
  @ApiOperation({ summary: 'Actualizar profit margin de una estrategia activa' })
  @ApiParam({ name: 'id', required: true, example: 'unique-strategy-id' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        profitMargin: { type: 'number', example: 0.001 }
      },
      required: ['profitMargin'],
    },
  })
  async updateProfitMargin(@Param('id') id: string, @Body() body: { profitMargin: number }) {
    await this.botService.updateProfitMargin(id, body.profitMargin);
    return { message: `Profit margin actualizado para estrategia ${id}` };
  }

  @Post('orderLevel/:id')
  @ApiOperation({ summary: 'Agregar nivel de orden a una estrategia activa' })
  @ApiParam({ name: 'id', required: true, example: 'unique-strategy-id' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        price: { type: 'number', example: 15.5 },
        quantity: { type: 'number', example: 0.3 },
        id: { type: 'number', example: 4 }
      },
      required: ['price', 'quantity', 'id'],
    },
  })
  async addOrderLevel(@Param('id') id: string, @Body() body: { price: number, quantity: number, id: number }) {
    await this.botService.addOrderLevel(id, body);
    return { message: `Nivel de orden agregado para estrategia ${id}` };
  }

  @Delete('orderLevel/:id/:levelIndex')
  @ApiOperation({ summary: 'Eliminar nivel de orden de una estrategia activa' })
  @ApiParam({ name: 'id', required: true, example: 'unique-strategy-id' })
  @ApiParam({ name: 'levelIndex', required: true, example: 2 })
  async removeOrderLevel(@Param('id') id: string, @Param('levelIndex') levelIndex: number) {
    await this.botService.removeOrderLevel(id, levelIndex);
    return { message: `Nivel de orden ${levelIndex} eliminado para estrategia ${id}` };
  }

  @Patch('orderLevelPrice/:id/:levelIndex')
  @ApiOperation({ summary: 'Actualizar precio de nivel de orden en una estrategia activa' })
  @ApiParam({ name: 'id', required: true, example: 'unique-strategy-id' })
  @ApiParam({ name: 'levelIndex', required: true, example: 1 })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        newPrice: { type: 'number', example: 16.0 }
      },
      required: ['newPrice'],
    },
  })
  async updateOrderLevelPrice(@Param('id') id: string, @Param('levelIndex') levelIndex: number, @Body() body: { newPrice: number }) {
    await this.botService.updateOrderLevelPrice(id, levelIndex, body.newPrice);
    return { message: `Precio actualizado para nivel ${levelIndex} en estrategia ${id}` };
  }
  


}
