import { Controller, Post, Body, Patch, Delete, Param, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { BotService } from './bot.service';
import { AuthGuard, Public } from 'src/authA/auth.guard';

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
        id: { type: 'string', example: 'strategy1' }
      },
      required: ['symbol', 'strategyType', 'config', 'id'],
    },
  })
  async startBot(@Body() body: { symbol: string; id: string; typeId: number; strategyType: string; config: any }) {
    await this.botService.startStrategy(body.symbol, body.typeId, body.strategyType, body.config, body.id);
    return { message: `Bot iniciado para ${body.symbol} con estrategia ${body.strategyType} y id ${body.id}` };
  }

  @Delete('stop/:symbol/:id')
  @ApiOperation({ summary: 'Parar un bot activo' })
  @ApiParam({ name: 'symbol', required: true, example: 'BTCUSDT' })
  @ApiParam({ name: 'id', required: true, example: 'strategy1' })
  async stopBot(@Param('symbol') symbol: string, @Param('id') id: string) {
    await this.botService.stopStrategy(symbol, id);
    return { message: `Bot detenido para ${symbol} con id ${id}` };
  }

  @Get('active')
  @ApiOperation({ summary: 'Listar bots activos' })
  @ApiResponse({ status: 200, description: 'Lista de bots activos.' })
  getActiveBots() {
    return this.botService.getActiveBots();
  }

  @Get('otro')
  @ApiOperation({ summary: 'Listar datos de bots activos' })
  @ApiResponse({ status: 200, description: 'Lista de datos de los bots activos.' })
  getActiveBotsData() {
    return this.botService.getActiveBotsData();
  }

  @Get('InfoBotsComplet')
  @ApiOperation({ summary: 'Listar información completa de bots' })
  @ApiResponse({ status: 200, description: 'Listado completo de información de bots' })
  getBotActiveInfo() {
    // la lógica interna permanece igual, ajusta si quieres usar el método correcto
    // pero aquí lo ajusto para que solo llame getBots()
    const data = this.botService.getBots();

    // resto del código como estaba...
  }

  @Get('data')
  @ApiOperation({ summary: 'Listar datos detallados de bots activos' })
  @ApiResponse({ status: 200, description: 'Lista de datos de bots activos.' })
  getActiveBotsDate() {
    return this.botService.getActiveBotsData();
  }

  // Actualizar profit margin
  @Patch('profitMargin/:symbol/:id')
  @ApiOperation({ summary: 'Actualizar profit margin de una estrategia activa' })
  @ApiParam({ name: 'symbol', required: true, example: 'BTCUSDT' })
  @ApiParam({ name: 'id', required: true, example: 'strategy1' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        profitMargin: { type: 'number', example: 0.001 }
      },
      required: ['profitMargin'],
    },
  })
  async updateProfitMargin(@Param('symbol') symbol: string, @Param('id') id: string, @Body() body: { profitMargin: number }) {
    await this.botService.updateProfitMargin(id, symbol, body.profitMargin);
    return { message: `Profit margin actualizado para estrategia ${id} en ${symbol}` };
  }

  // Agregar nivel de orden
  @Post('orderLevel/:symbol/:id')
  @ApiOperation({ summary: 'Agregar nivel de orden a una estrategia activa' })
  @ApiParam({ name: 'symbol', required: true, example: 'BTCUSDT' })
  @ApiParam({ name: 'id', required: true, example: 'strategy1' })
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
  async addOrderLevel(@Param('symbol') symbol: string, @Param('id') id: string, @Body() body: { price: number, quantity: number, id: number }) {
    await this.botService.addOrderLevel(id, symbol, body);
    return { message: `Nivel de orden agregado para estrategia ${id}` };
  }

  // Eliminar nivel de orden
  @Delete('orderLevel/:symbol/:id/:levelIndex')
  @ApiOperation({ summary: 'Eliminar nivel de orden de una estrategia activa' })
  @ApiParam({ name: 'symbol', required: true, example: 'BTCUSDT' })
  @ApiParam({ name: 'id', required: true, example: 'strategy1' })
  @ApiParam({ name: 'levelIndex', required: true, example: 2 })
  async removeOrderLevel(@Param('symbol') symbol: string, @Param('id') id: string, @Param('levelIndex') levelIndex: number) {
    await this.botService.removeOrderLevel(id, symbol, levelIndex);
    return { message: `Nivel de orden ${levelIndex} eliminado para estrategia ${id}` };
  }

  // Actualizar precio de nivel de orden
  @Patch('orderLevelPrice/:symbol/:id/:levelIndex')
  @ApiOperation({ summary: 'Actualizar precio de nivel de orden en una estrategia activa' })
  @ApiParam({ name: 'symbol', required: true, example: 'BTCUSDT' })
  @ApiParam({ name: 'id', required: true, example: 'strategy1' })
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
  async updateOrderLevelPrice(@Param('symbol') symbol: string, @Param('id') id: string, @Param('levelIndex') levelIndex: number, @Body() body: { newPrice: number }) {
    await this.botService.updateOrderLevelPrice(id, symbol, levelIndex, body.newPrice);
    return { message: `Precio actualizado para nivel ${levelIndex} en estrategia ${id}` };
  }
}
