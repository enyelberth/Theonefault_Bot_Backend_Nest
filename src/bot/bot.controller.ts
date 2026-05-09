import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BotService } from './bot.service';
import { AuthGuard } from 'src/authA/auth.guard';
import {
  OrderLevelDto,
  StartBotDto,
  UpdateOrderLevelPriceDto,
  UpdateProfitMarginDto,
} from './dto/create-bot.dto';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('bot')
@Controller('bot')
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Post('start')
  @ApiOperation({ summary: 'Iniciar un bot con la configuración enviada' })
  async startBot(
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: StartBotDto,
  ) {
    await this.botService.startStrategy(
      body.symbol,
      body.typeId,
      body.strategyType,
      body.config,
      body.id,
    );
    return {
      message: `Bot iniciado para ${body.symbol} con estrategia ${body.strategyType} y id ${body.id}`,
    };
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
  @ApiResponse({
    status: 200,
    description: 'Lista de datos de los bots activos.',
  })
  getActiveBotsData() {
    return this.botService.getActiveBotsData();
  }

  @Get('InfoBotsComplet')
  @ApiOperation({ summary: 'Listar información completa de bots' })
  @ApiResponse({
    status: 200,
    description: 'Listado completo de información de bots',
  })
  getBotActiveInfo() {
    return this.botService.getBots();
  }

  @Get('data')
  @ApiOperation({ summary: 'Listar datos detallados de bots activos' })
  @ApiResponse({ status: 200, description: 'Lista de datos de bots activos.' })
  getActiveBotsDate() {
    return this.botService.getActiveBotsData();
  }

  // Actualizar profit margin
  @Patch('profitMargin/:symbol/:id')
  @ApiOperation({
    summary: 'Actualizar profit margin de una estrategia activa',
  })
  @ApiParam({ name: 'symbol', required: true, example: 'BTCUSDT' })
  @ApiParam({ name: 'id', required: true, example: 'strategy1' })
  async updateProfitMargin(
    @Param('symbol') symbol: string,
    @Param('id') id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: UpdateProfitMarginDto,
  ) {
    await this.botService.updateProfitMargin(id, symbol, body.profitMargin);
    return {
      message: `Profit margin actualizado para estrategia ${id} en ${symbol}`,
    };
  }

  // Agregar nivel de orden
  @Post('orderLevel/:symbol/:id')
  @ApiOperation({ summary: 'Agregar nivel de orden a una estrategia activa' })
  @ApiParam({ name: 'symbol', required: true, example: 'BTCUSDT' })
  @ApiParam({ name: 'id', required: true, example: 'strategy1' })
  async addOrderLevel(
    @Param('symbol') symbol: string,
    @Param('id') id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: OrderLevelDto,
  ) {
    await this.botService.addOrderLevel(id, symbol, body);
    return { message: `Nivel de orden agregado para estrategia ${id}` };
  }

  // Eliminar nivel de orden
  @Delete('orderLevel/:symbol/:id/:levelIndex')
  @ApiOperation({ summary: 'Eliminar nivel de orden de una estrategia activa' })
  @ApiParam({ name: 'symbol', required: true, example: 'BTCUSDT' })
  @ApiParam({ name: 'id', required: true, example: 'strategy1' })
  @ApiParam({ name: 'levelIndex', required: true, example: 2 })
  async removeOrderLevel(
    @Param('symbol') symbol: string,
    @Param('id') id: string,
    @Param('levelIndex', ParseIntPipe) levelIndex: number,
  ) {
    await this.botService.removeOrderLevel(id, symbol, levelIndex);
    return {
      message: `Nivel de orden ${levelIndex} eliminado para estrategia ${id}`,
    };
  }

  // Actualizar precio de nivel de orden
  @Patch('orderLevelPrice/:symbol/:id/:levelIndex')
  @ApiOperation({
    summary: 'Actualizar precio de nivel de orden en una estrategia activa',
  })
  @ApiParam({ name: 'symbol', required: true, example: 'BTCUSDT' })
  @ApiParam({ name: 'id', required: true, example: 'strategy1' })
  @ApiParam({ name: 'levelIndex', required: true, example: 1 })
  async updateOrderLevelPrice(
    @Param('symbol') symbol: string,
    @Param('id') id: string,
    @Param('levelIndex', ParseIntPipe) levelIndex: number,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: UpdateOrderLevelPriceDto,
  ) {
    await this.botService.updateOrderLevelPrice(
      id,
      symbol,
      levelIndex,
      body.newPrice,
    );
    return {
      message: `Precio actualizado para nivel ${levelIndex} en estrategia ${id}`,
    };
  }

  @Get('decision-log')
  @ApiOperation({
    summary: 'Bitácora de decisiones del bot y resultados operativos',
  })
  getDecisionLog(
    @Query('symbol') symbol?: string,
    @Query('strategyId') strategyId?: string,
  ) {
    return this.botService.getDecisionLog(symbol, strategyId);
  }

  @Get('execution-log')
  @ApiOperation({
    summary:
      'Bitácora de órdenes y eventos de ejecución en Binance por estrategia',
  })
  getExecutionLog(
    @Query('symbol') symbol?: string,
    @Query('strategyId') strategyId?: string,
  ) {
    return this.botService.getExecutionLog(strategyId, symbol);
  }

  @Get('performance')
  @ApiOperation({
    summary:
      'Estadísticas de rendimiento por estrategia (winrate, pnl, fills, etc.)',
  })
  getPerformance(@Query('strategyId') strategyId?: string) {
    return this.botService.getPerformance(strategyId);
  }

  @Get('performance-history')
  @ApiOperation({
    summary: 'Historial de performance por día basado en eventos persistidos',
  })
  async getPerformanceHistory(
    @Query('strategyId') strategyId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.botService.getPerformanceHistory(strategyId, from, to);
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Dashboard consolidado de órdenes, fills y PnL por estrategia',
  })
  async getDashboard(@Query('strategyId') strategyId?: string) {
    return this.botService.getDashboard(strategyId);
  }

  @Patch('risk/:strategyId')
  @ApiOperation({
    summary: 'Actualizar controles de riesgo en configuración de estrategia',
  })
  async updateRisk(
    @Param('strategyId') strategyId: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: {
      maxOpenPositions?: number;
      maxDailyLoss?: number;
      maxNotionalPerOrder?: number;
      cooldownMsAfterLoss?: number;
    },
  ) {
    await this.botService.updateRiskControls(strategyId, body);
    return {
      message: `Controles de riesgo actualizados para estrategia ${strategyId}`,
    };
  }

  @Post('panic-stop/:strategyId')
  @ApiOperation({
    summary:
      'Detiene estrategia y ejecuta liquidación de emergencia de la posición',
  })
  async panicStop(
    @Param('strategyId') strategyId: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
      }),
    )
    body: {
      symbol?: string;
      market?: 'spot' | 'margin';
      strategyType?: string;
    },
  ) {
    return this.botService.panicStop(strategyId, body);
  }
}
