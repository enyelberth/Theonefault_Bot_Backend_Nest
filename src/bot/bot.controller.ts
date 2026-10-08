import {
  Controller,
  Post,
  Body,
  Patch,
  Delete,
  Param,
  Get,
  UseGuards,
  Query,
  Req,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { PaperOrderStatus, PrismaClient } from '@prisma/client';
import { BotService } from './bot.service';
import { BotPnlService } from './bot-pnl.service';
import { AuthGuard } from 'src/authA/auth.guard';

interface AuthenticatedRequest extends Request {
  user?: { sub: number; email?: string };
}

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('bot')
@Controller('bot')
export class BotController {
  constructor(
    private readonly botService: BotService,
    private readonly botPnlService: BotPnlService,
    private readonly prisma: PrismaClient,
  ) {}

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
        id: { type: 'string', example: 'strategy1' },
      },
      required: ['symbol', 'strategyType', 'config', 'id'],
    },
  })
  async startBot(
    @Body()
    body: {
      symbol: string;
      id: string;
      typeId: number;
      strategyType: string;
      config: any;
    },
    @Req() req: AuthenticatedRequest,
  ) {
    await this.botService.startStrategy(
      body.symbol,
      body.typeId,
      body.strategyType,
      body.config,
      body.id,
      req.user!.sub,
    );
    return {
      message: `Bot iniciado para ${body.symbol} con estrategia ${body.strategyType} y id ${body.id}`,
    };
  }

  @Delete('stop/:symbol/:id')
  @ApiOperation({ summary: 'Parar un bot activo' })
  @ApiParam({ name: 'symbol', required: true, example: 'BTCUSDT' })
  @ApiParam({ name: 'id', required: true, example: 'strategy1' })
  async stopBot(
    @Param('symbol') symbol: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.botService.assertOwnership(symbol, id, req.user!.sub);
    await this.botService.stopStrategy(symbol, id);
    return { message: `Bot detenido para ${symbol} con id ${id}` };
  }

  @Post('restart/:symbol/:id')
  @ApiOperation({
    summary:
      'Reiniciar bot: stop + start reutilizando configSnapshot y strategyType del BotRun',
  })
  @ApiParam({ name: 'symbol', required: true, example: 'BTCUSDT' })
  @ApiParam({ name: 'id', required: true, example: 'strategy1' })
  async restartBot(
    @Param('symbol') symbol: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.botService.assertOwnership(symbol, id, req.user!.sub);
    const result = await this.botService.restartStrategy(symbol, id);
    return {
      message: `Bot reiniciado para ${symbol} con id ${id}`,
      ...result,
    };
  }

  @Get('active')
  @ApiOperation({ summary: 'Listar bots activos' })
  @ApiResponse({ status: 200, description: 'Lista de bots activos.' })
  getActiveBots() {
    return this.botService.getActiveBots();
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

  // Estado runtime (contadores + niveles abiertos)
  @Get('runtime/:symbol/:id')
  @ApiOperation({
    summary:
      'Estado en tiempo real: filledCount, canceledCount, niveles abiertos',
  })
  @ApiParam({ name: 'symbol', required: true, example: 'BNBFDUSD' })
  @ApiParam({ name: 'id', required: true, example: 'bnbfdusd-er10' })
  async getRuntime(
    @Param('symbol') symbol: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.botService.assertOwnership(
      symbol.toUpperCase(),
      id,
      req.user!.sub,
    );
    return this.botService.getRuntimeStatus(symbol.toUpperCase(), id);
  }

  // Leer config actual
  @Get('config/:symbol/:id')
  @ApiOperation({
    summary: 'Obtener config actual de una estrategia (viva o última en DB)',
  })
  @ApiParam({ name: 'symbol', required: true, example: 'BNBFDUSD' })
  @ApiParam({ name: 'id', required: true, example: 'bnbfdusd-er10' })
  async getStrategyConfig(
    @Param('symbol') symbol: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.botService.assertOwnership(
      symbol.toUpperCase(),
      id,
      req.user!.sub,
    );
    return this.botService.getStrategyConfig(symbol.toUpperCase(), id);
  }

  // Editar config (merge parcial). ?restart=true reinicia bot.
  @Patch('config/:symbol/:id')
  @ApiOperation({
    summary:
      'Actualizar config de una estrategia. Campos numéricos como profitMargin se aplican en caliente. Campos estructurales (grid*, lowerPrice, upperPrice, gridStepPrice, totalQuantity) requieren ?restart=true.',
  })
  @ApiParam({ name: 'symbol', required: true, example: 'BNBFDUSD' })
  @ApiParam({ name: 'id', required: true, example: 'bnbfdusd-er10' })
  @ApiQuery({ name: 'restart', required: false, type: 'boolean' })
  @ApiBody({
    schema: {
      type: 'object',
      example: {
        profitMargin: 0.0006,
        buySafetyMargin: 0.0004,
      },
    },
  })
  async updateStrategyConfig(
    @Param('symbol') symbol: string,
    @Param('id') id: string,
    @Body() patch: Record<string, any>,
    @Req() req: AuthenticatedRequest,
    @Query('restart') restart?: string,
  ) {
    await this.botService.assertOwnership(
      symbol.toUpperCase(),
      id,
      req.user!.sub,
    );
    const STRUCTURAL = new Set([
      'lowerPrice',
      'upperPrice',
      'gridCount',
      'gridStepPrice',
      'totalQuantity',
      'uniformQuantity',
      'minOrderNotional',
      'dryRun',
    ]);
    const hasStructural = Object.keys(patch).some((k) => STRUCTURAL.has(k));
    const requiresRestart =
      restart === 'true' || restart === '1' || hasStructural;
    return this.botService.updateStrategyConfig(
      symbol.toUpperCase(),
      id,
      patch,
      {
        requiresRestart,
      },
    );
  }

  // Actualizar profit margin
  @Patch('profitMargin/:symbol/:id')
  @ApiOperation({
    summary: 'Actualizar profit margin de una estrategia activa',
  })
  @ApiParam({ name: 'symbol', required: true, example: 'BTCUSDT' })
  @ApiParam({ name: 'id', required: true, example: 'strategy1' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        profitMargin: { type: 'number', example: 0.001 },
      },
      required: ['profitMargin'],
    },
  })
  async updateProfitMargin(
    @Param('symbol') symbol: string,
    @Param('id') id: string,
    @Body() body: { profitMargin: number },
    @Req() req: AuthenticatedRequest,
  ) {
    await this.botService.assertOwnership(symbol, id, req.user!.sub);
    await this.botService.updateProfitMargin(id, symbol, body.profitMargin);
    return {
      message: `Profit margin actualizado para estrategia ${id} en ${symbol}`,
    };
  }

  // Agregar nivel de orden
  @Post('orderLevel/:symbol/:id')
  @ApiOperation({
    summary:
      'Agregar nivel de orden manual (LIMIT BUY) a estrategia activa. quantity opcional: si omite, usa minOrderNotional o qty uniforme del grid.',
  })
  @ApiParam({ name: 'symbol', required: true, example: 'BNBFDUSD' })
  @ApiParam({ name: 'id', required: true, example: 'bnbfdusd-er10' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        price: { type: 'number', example: 573.24 },
        quantity: {
          type: 'number',
          example: 0.011,
          description: 'Opcional. Si omitido, se calcula desde config.',
        },
        id: { type: 'number', example: 4 },
      },
      required: ['price'],
    },
  })
  async addOrderLevel(
    @Param('symbol') symbol: string,
    @Param('id') id: string,
    @Body() body: { price: number; quantity?: number; id?: number },
    @Req() req: AuthenticatedRequest,
  ) {
    await this.botService.assertOwnership(
      symbol.toUpperCase(),
      id,
      req.user!.sub,
    );
    const result = await this.botService.addOrderLevel(
      id,
      symbol.toUpperCase(),
      body,
    );
    return { message: `Nivel manual agregado`, result };
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
    @Param('levelIndex') levelIndex: number,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.botService.assertOwnership(symbol, id, req.user!.sub);
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
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        newPrice: { type: 'number', example: 16.0 },
      },
      required: ['newPrice'],
    },
  })
  async updateOrderLevelPrice(
    @Param('symbol') symbol: string,
    @Param('id') id: string,
    @Param('levelIndex') levelIndex: number,
    @Body() body: { newPrice: number },
    @Req() req: AuthenticatedRequest,
  ) {
    await this.botService.assertOwnership(symbol, id, req.user!.sub);
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

  @Get('runs/active')
  @ApiOperation({ summary: 'Listar BotRuns activos (persistidos en DB)' })
  listActiveRuns() {
    return this.botPnlService.listActiveBotRuns();
  }

  @Get('runs/:botRunId/summary')
  @ApiOperation({ summary: 'Resumen PnL de un BotRun' })
  @ApiParam({ name: 'botRunId', type: 'number', example: 1 })
  getRunSummary(@Param('botRunId') botRunId: string) {
    return this.botPnlService.getBotRunSummary(Number(botRunId));
  }

  @Get('runs/:botRunId/metrics')
  @ApiOperation({ summary: 'Métricas históricas de un BotRun' })
  @ApiParam({ name: 'botRunId', type: 'number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  getRunMetrics(
    @Param('botRunId') botRunId: string,
    @Query('limit') limit?: string,
  ) {
    return this.botPnlService.listBotRunMetrics(
      Number(botRunId),
      limit ? Number(limit) : 100,
    );
  }

  @Get('runs/:botRunId/trades')
  @ApiOperation({ summary: 'Trades cerrados de un BotRun' })
  @ApiParam({ name: 'botRunId', type: 'number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  getRunTrades(
    @Param('botRunId') botRunId: string,
    @Query('limit') limit?: string,
  ) {
    return this.botPnlService.listTradeResults(
      Number(botRunId),
      limit ? Number(limit) : 100,
    );
  }

  @Get('paper-orders')
  @ApiOperation({ summary: 'Listar PaperOrders (bots en modo dryRun)' })
  @ApiQuery({ name: 'symbol', required: false, example: 'BTCUSDT' })
  @ApiQuery({ name: 'botRunId', required: false, type: 'number' })
  @ApiQuery({ name: 'status', required: false, example: 'OPEN' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  async listPaperOrders(
    @Query('symbol') symbol?: string,
    @Query('botRunId') botRunId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const where: any = {};
    if (symbol) where.symbol = symbol.toUpperCase();
    if (botRunId) where.botRunId = Number(botRunId);
    if (status) where.status = status.toUpperCase() as PaperOrderStatus;
    return this.prisma.paperOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit ? Number(limit) : 200,
    });
  }

  @Get('runs/lookup/:symbol/:strategyId')
  @ApiOperation({ summary: 'Obtener botRunId activo por (symbol, strategyId)' })
  @ApiParam({ name: 'symbol', example: 'BTCUSDT' })
  @ApiParam({ name: 'strategyId', example: 'strategy1' })
  async lookupRun(
    @Param('symbol') symbol: string,
    @Param('strategyId') strategyId: string,
  ) {
    const run = await this.botPnlService.findActiveBotRun(strategyId, symbol);
    if (!run) throw new NotFoundException('BotRun activo no encontrado');
    return run;
  }
}
