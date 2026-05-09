import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiQuery,
  ApiBearerAuth,
  ApiProperty,
} from '@nestjs/swagger';
import { BinanceService } from './binance.service';
import {
  CreateLimitOrderDto,
  CreateMarketOrderDto,
  CreateOcoOrderDto,
} from './dto/create-binance.dto';
import { AuthGuard } from '../authA/auth.guard';
import { StrategyOpsService } from '../strategy-monitoring/strategy-ops.service';
import { IsNotEmpty, IsString } from 'class-validator';
class RepayCrossMarginDto {
  @ApiProperty({ description: 'Activo a repagar', example: 'USDT' })
  @IsString()
  @IsNotEmpty()
  asset: string;

  @ApiProperty({ description: 'Cantidad a repagar', example: '10.5' })
  @IsString()
  @IsNotEmpty()
  amount: string;
}
@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('binance')
@Controller('binance')
export class BinanceController {
  constructor(
    private readonly binanceService: BinanceService,
    private readonly strategyOps: StrategyOpsService,
  ) {}

  @Get('account-info')
  @ApiOperation({ summary: 'Obtener información completa de la cuenta' })
  @ApiResponse({
    status: 200,
    description: 'Información de la cuenta obtenida correctamente.',
  })
  async getAccountInfo() {
    return this.binanceService.getAccountInfo();
  }

  @Get('account-balance')
  @ApiOperation({ summary: 'Obtener información del balance de la cuenta' })
  @ApiResponse({
    status: 200,
    description: 'Información del balance de la cuenta obtenida correctamente.',
  })
  async getAccountBalance() {
    return this.binanceService.getNonZeroBalances();
  }

  @Get('balance/spot')
  @ApiOperation({ summary: 'Obtener saldo de fondos Spot' })
  @ApiResponse({
    status: 200,
    description: 'Saldo spot obtenido correctamente.',
  })
  async getSpotBalances() {
    return this.binanceService.getNonZeroBalances();
  }

  @Get('balance/margin/cross')
  @ApiOperation({ summary: 'Obtener saldo de margen cruzado' })
  @ApiResponse({
    status: 200,
    description: 'Saldo de margin cruzado obtenido correctamente.',
  })
  async getCrossMarginBalances() {
    return this.binanceService.getCrossMarginLoans();
  }

  @Get('balance/margin/isolated')
  @ApiOperation({ summary: 'Obtener saldo de margen aislado' })
  @ApiResponse({
    status: 200,
    description: 'Saldo de margin aislado obtenido correctamente.',
  })
  async getIsolatedMarginBalances() {
    return this.binanceService.getIsolatedMarginBalances();
  }

  @Post('order/limit')
  @ApiOperation({ summary: 'Crear una orden limit' })
  @ApiCreatedResponse({
    description: 'Orden limit creada correctamente.',
    type: CreateLimitOrderDto,
  })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos.' })
  async createLimitOrder(@Body() dto: CreateLimitOrderDto) {
    return this.binanceService.createLimitOrder(
      dto.symbol,
      dto.side,
      dto.quantity,
      dto.price,
      dto.timeInForce,
    );
  }

  @Post('order/market')
  @ApiOperation({ summary: 'Crear una orden market' })
  @ApiCreatedResponse({ description: 'Orden market creada correctamente.' })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos.' })
  async createMarketOrder(@Body() dto: CreateMarketOrderDto) {
    return this.binanceService.createMarketOrder(
      dto.symbol,
      dto.side,
      dto.quantity,
    );
  }

  @Post('order/oco')
  @ApiOperation({ summary: 'Crear una orden OCO (One-Cancels-the-Other)' })
  @ApiCreatedResponse({ description: 'Orden OCO creada correctamente.' })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos.' })
  async createOcoOrder(@Body() dto: CreateOcoOrderDto) {
    return this.binanceService.createOcoOrder(
      dto.symbol,
      dto.side,
      dto.quantity,
      dto.price,
      dto.stopPrice,
      dto.stopLimitPrice,
      dto.stopLimitTimeInForce,
    );
  }
  @Post('order/oco/cross-margin')
  @ApiOperation({ summary: 'Crear orden OCO en margin cruzado' })
  @ApiCreatedResponse({
    description: 'Orden OCO margin cruzado creada correctamente.',
  })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos.' })
  async createCrossMarginOcoOrder(@Body() dto: CreateOcoOrderDto) {
    return this.binanceService.createCrossMarginOcoOrder(
      dto.symbol,
      dto.side,
      dto.quantity,
      dto.price,
      dto.stopPrice,
      dto.stopLimitPrice,
      dto.stopLimitTimeInForce,
    );
  }
  @Post('order/limit/cross')
  @ApiOperation({ summary: 'Crear una orden limit en margin cruzado' })
  @ApiCreatedResponse({
    description: 'Orden limit margin cruzado creada correctamente.',
    type: CreateLimitOrderDto,
  })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos.' })
  async createCrossMarginLimitOrder(@Body() dto: CreateLimitOrderDto) {
    console.log('Received DTO:', dto);
    return this.binanceService.createCrossMarginLimitOrder(
      dto.symbol,
      dto.side,
      dto.quantity,
      dto.price,
      dto.timeInForce,
    );
  }

  @Post('order/market/cross')
  @ApiOperation({ summary: 'Crear una orden market en margin cruzado' })
  @ApiCreatedResponse({
    description: 'Orden market margin cruzado creada correctamente.',
  })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos.' })
  async createCrossMarginMarketOrder(@Body() dto: CreateMarketOrderDto) {
    return this.binanceService.createCrossMarginMarketOrder(
      dto.symbol,
      dto.side,
      dto.quantity,
    );
  }

  @Post('order/limit/isolated')
  @ApiOperation({ summary: 'Crear una orden limit en margin aislado' })
  @ApiCreatedResponse({
    description: 'Orden limit margin aislado creada correctamente.',
    type: CreateLimitOrderDto,
  })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos.' })
  async createIsolatedMarginLimitOrder(@Body() dto: CreateLimitOrderDto) {
    return this.binanceService.createIsolatedMarginLimitOrder(
      dto.symbol,
      dto.side,
      dto.quantity,
      dto.price,
      dto.timeInForce,
    );
  }

  @Post('order/market/isolated')
  @ApiOperation({ summary: 'Crear una orden market en margin aislado' })
  @ApiCreatedResponse({
    description: 'Orden market margin aislado creada correctamente.',
  })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos.' })
  async createIsolatedMarginMarketOrder(@Body() dto: CreateMarketOrderDto) {
    return this.binanceService.createIsolatedMarginMarketOrder(
      dto.symbol,
      dto.side,
      dto.quantity,
    );
  }

  @Get('order/:symbol/:orderId')
  @ApiOperation({ summary: 'Consultar estado de una orden' })
  @ApiParam({
    name: 'symbol',
    type: String,
    description: 'Símbolo del par (ej. BTCUSDT)',
  })
  @ApiParam({ name: 'orderId', type: Number, description: 'ID de la orden' })
  @ApiResponse({
    status: 200,
    description: 'Estado de la orden obtenido correctamente.',
  })
  @ApiNotFoundResponse({ description: 'Orden no encontrada.' })
  async getOrderStatus(
    @Param('symbol') symbol: string,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.binanceService.checkOrderStatus(symbol, orderId);
  }
  @Post('margin-cross/orders/cancel/:symbol')
  @ApiOperation({
    summary:
      'Cancelar todas las órdenes margin cruzado abiertas para un símbolo y lado',
  })
  @ApiParam({
    name: 'symbol',
    type: String,
    description: 'Símbolo del par (ej. BTCUSDT)',
  })
  @ApiQuery({
    name: 'side',
    required: true,
    enum: ['BUY', 'SELL'],
    description: 'Lado de la orden a cancelar: BUY o SELL',
  })
  @ApiResponse({
    status: 200,
    description: 'Órdenes margin cruzado canceladas correctamente.',
  })
  async cancelAllCrossMarginOrdersBySide(
    @Param('symbol') symbol: string,
    @Query('side') side: 'BUY' | 'SELL',
  ) {
    return this.binanceService.cancelAllCrossMarginOrdersBySide(symbol, side);
  }

  @Get('orders/:symbol')
  @ApiOperation({ summary: 'Obtener todas las órdenes de un símbolo' })
  @ApiParam({
    name: 'symbol',
    type: String,
    description: 'Símbolo del par, ej. BTCUSDT',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Cantidad máxima de órdenes a obtener',
  })
  @ApiQuery({
    name: 'fromId',
    required: false,
    type: Number,
    description: 'ID desde donde iniciar la búsqueda',
  })
  @ApiResponse({ status: 200, description: 'Órdenes obtenidas correctamente.' })
  async getAllOrders(
    @Param('symbol') symbol: string,
    @Query('limit') limit?: number,
    @Query('fromId') fromId?: number,
  ) {
    return this.binanceService.getAllOrders(symbol, limit ?? 500, fromId);
  }

  @Post('orders/cancel-all/:symbol')
  @ApiOperation({
    summary: 'Cancelar todas las órdenes abiertas de un símbolo',
  })
  @ApiParam({
    name: 'symbol',
    type: String,
    description: 'Símbolo del par, ej. LINKUSDT',
  })
  @ApiResponse({
    status: 200,
    description: 'Órdenes canceladas correctamente.',
  })
  async cancelAllOrders(@Param('symbol') symbol: string) {
    return this.binanceService.cancelAllOrders(symbol);
  }

  @Get('margin-cross/orders/:symbol')
  @ApiOperation({
    summary: 'Obtener todas las órdenes margin cruzado para un símbolo',
  })
  @ApiParam({
    name: 'symbol',
    type: String,
    description: 'Símbolo del par (ej. BTCUSDT)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Límite máximo de órdenes a obtener',
  })
  @ApiQuery({
    name: 'fromId',
    required: false,
    type: Number,
    description: 'ID para paginación',
  })
  @ApiResponse({
    status: 200,
    description: 'Órdenes margin cruzado obtenidas correctamente.',
  })
  async getAllCrossMarginOrders(
    @Param('symbol') symbol: string,
    @Query('limit') limit?: number,
    @Query('fromId') fromId?: number,
  ) {
    return this.binanceService.getAllCrossMarginOrders(
      symbol,
      limit ?? 500,
      fromId,
    );
  }

  @Get('margin-cross/order/:symbol/:orderId')
  @ApiOperation({ summary: 'Consultar una orden margin cruzado específica' })
  @ApiParam({
    name: 'symbol',
    type: String,
    description: 'Símbolo del par (ej. BTCUSDT)',
  })
  @ApiParam({ name: 'orderId', type: Number, description: 'ID de la orden' })
  @ApiResponse({
    status: 200,
    description: 'Orden margin cruzado obtenida correctamente.',
  })
  async getCrossMarginOrderStatus(
    @Param('symbol') symbol: string,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.binanceService.getCrossMarginOrderStatus(symbol, orderId);
  }

  @Post('margin-cross/orders/cancel-all/:symbol')
  @ApiOperation({
    summary:
      'Cancelar todas las órdenes margin cruzado abiertas para un símbolo',
  })
  @ApiParam({
    name: 'symbol',
    type: String,
    description: 'Símbolo del par (ej. BTCUSDT)',
  })
  @ApiResponse({
    status: 200,
    description: 'Órdenes margin cruzado canceladas correctamente.',
  })
  async cancelAllCrossMarginOrders(@Param('symbol') symbol: string) {
    return this.binanceService.cancelAllCrossMarginOrders(symbol);
  }
  @Post('margin-cross/order/cancel/:symbol/:orderId')
  @ApiOperation({ summary: 'Cancelar una orden margin cruzado' })
  @ApiParam({
    name: 'symbol',
    type: String,
    description: 'Símbolo del par (ej. BTCUSDT)',
  })
  @ApiParam({ name: 'orderId', type: Number, description: 'ID de la orden' })
  @ApiResponse({
    status: 200,
    description: 'Orden margin cruzado cancelada correctamente.',
  })
  async cancelCrossMarginOrder(
    @Param('symbol') symbol: string,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.binanceService.cancelCrossMarginOrder(symbol, orderId);
  }
  @Get('margin-cross/positions')
  @ApiOperation({
    summary: 'Obtener todas las posiciones margin cruzado con ganancia/pérdida',
  })
  @ApiResponse({
    status: 200,
    description: 'Posiciones margin cruzado obtenidas correctamente.',
  })
  async getCrossMarginPositions() {
    return this.binanceService.getCrossMarginPositions();
  }

  @Get('margin-cross/position/:symbol')
  @ApiOperation({
    summary:
      'Obtener posición margin cruzado y ganancia/pérdida no realizada para un símbolo',
  })
  @ApiParam({
    name: 'symbol',
    type: String,
    description: 'Símbolo del par (ej. BTCUSDT)',
  })
  @ApiResponse({
    status: 200,
    description: 'Posición margin cruzado obtenida correctamente.',
  })
  async getCrossMarginPosition(@Param('symbol') symbol: string) {
    return this.binanceService.getCrossMarginPosition(symbol);
  }

  @Get('margin-cross/unrealized-profit/:symbol')
  @ApiOperation({
    summary:
      'Obtener ganancia o pérdida no realizada en margin cruzado para un símbolo',
  })
  @ApiParam({
    name: 'symbol',
    type: String,
    description: 'Símbolo del par (ej. BTCUSDT)',
  })
  @ApiResponse({
    status: 200,
    description: 'Ganancia o pérdida margin cruzado obtenida correctamente.',
  })
  async getCrossMarginUnrealizedProfit(@Param('symbol') symbol: string) {
    return this.binanceService.getCrossMarginUnrealizedProfit(symbol);
  }

  @Get('margin-cross/profit-percent/:symbol')
  @ApiOperation({
    summary:
      'Obtener ganancia o pérdida en porcentaje en margin cruzado para un símbolo',
  })
  @ApiParam({
    name: 'symbol',
    type: String,
    description: 'Símbolo del par (ej. BTCUSDT)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Porcentaje de ganancia o pérdida margin cruzado obtenido correctamente.',
  })
  async getCrossMarginProfitPercent(@Param('symbol') symbol: string) {
    return this.binanceService.getCrossMarginProfitPercent(symbol);
  }
  @Get('margin-cross/summary')
  @ApiOperation({
    summary:
      'Obtener resumen de margin cruzado: Nivel de margen, ganancias y pérdidas',
  })
  @ApiResponse({
    status: 200,
    description: 'Resumen de margin cruzado obtenido correctamente.',
  })
  async getCrossMarginSummary() {
    return this.binanceService.calculateCrossMarginSummary();
  }

  @Get('margin-cross/pnl-risk-summary')
  @ApiOperation({
    summary:
      'Obtener Resumen de PNL, Nivel de Margen y Estado de Liquidación/Riesgo de la cuenta de Margin Cruzado.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Resumen de PNL y riesgo de liquidación obtenido correctamente.',
  })
  async getCrossMarginPNLSummary() {
    return this.binanceService.getCrossMarginPNLSummary();
  }
  @Get('margin-cross/saldo')
  @ApiOperation({ summary: 'Slado' })
  @ApiResponse({ status: 200, description: 'Saldo' })
  async getCrossMarginSaldo() {
    return this.binanceService.getCrossMarginSaldo();
  }
  @Get('margin-cross/liquid')
  @ApiOperation({ summary: 'Slado' })
  @ApiResponse({ status: 200, description: 'Saldo' })
  async getCrossMarginLiqui() {
    return this.binanceService.liquiCrossMagin();
  }
  @Post('margin-cross/repay')
  @ApiOperation({ summary: 'Repagar préstamo margin cruzado' })
  @ApiResponse({
    status: 200,
    description: 'Préstamo margin cruzado repagado correctamente.',
  })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos.' })
  async repayCrossMargin(@Body() dto: RepayCrossMarginDto) {
    return this.binanceService.repayCrossMargin(dto.asset, dto.amount);
  }

  @Get('balance/consolidated')
  @ApiOperation({
    summary:
      'Obtener balance consolidado de todos los activos (Spot + Margin + Futures)',
  })
  @ApiResponse({
    status: 200,
    description: 'Balance consolidado obtenido correctamente.',
  })
  async getConsolidatedBalance() {
    return this.binanceService.getConsolidatedBalance();
  }

  @Get('balance/available-to-trade')
  @ApiOperation({
    summary:
      'Obtener capital disponible para operar (sin margen, con margen, poder de endeudamiento)',
  })
  @ApiResponse({
    status: 200,
    description: 'Capital disponible obtenido correctamente.',
  })
  async getAvailableToTrade() {
    return this.binanceService.getAvailableToTrade();
  }

  @Get('balance/estimated-total-value')
  @ApiOperation({
    summary: 'Obtener valor estimado total del portafolio en USDT',
  })
  @ApiResponse({
    status: 200,
    description: 'Valor total del portafolio obtenido correctamente.',
  })
  async getEstimatedTotalValue() {
    return this.binanceService.getEstimatedTotalValue();
  }

  @Get('margin-cross/utilization')
  @ApiOperation({
    summary:
      'Obtener utilización de margen cruzado con alertas de riesgo en tiempo real',
  })
  @ApiResponse({
    status: 200,
    description: 'Utilización de margen obtenida correctamente.',
  })
  async getMarginUtilization() {
    return this.binanceService.getMarginUtilization();
  }

  @Get('wallet/funds-summary')
  @ApiOperation({
    summary:
      'Dashboard completo de fondos en billetera: total, desglose, disponible, bloqueado, poder de compra, etc',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard de fondos obtenido correctamente.',
  })
  async getWalletFundsSummary() {
    return this.binanceService.getWalletFundsSummary();
  }

  @Get('analysis/asset-performance')
  @ApiOperation({
    summary:
      'Análisis de rentabilidad y performance de cada activo en el portafolio',
  })
  @ApiResponse({
    status: 200,
    description: 'Análisis de performance obtenido correctamente.',
  })
  async getAssetPerformanceAnalysis() {
    return this.binanceService.getAssetPerformanceAnalysis();
  }

  @Get('analysis/risk-metrics')
  @ApiOperation({
    summary:
      'Métricas avanzadas de riesgo: Sharpe ratio, Sortino ratio, Max drawdown, VaR, Beta, etc',
  })
  @ApiResponse({
    status: 200,
    description: 'Métricas de riesgo obtenidas correctamente.',
  })
  async getAdvancedRiskMetrics() {
    return this.binanceService.getAdvancedRiskMetrics();
  }

  @Get('risk/alerts')
  @ApiOperation({
    summary: 'Real-time risk alerts and margin status snapshot',
    description:
      'Returns current risk events from strategy monitoring and margin account status',
  })
  @ApiResponse({
    status: 200,
    description: 'Risk alerts snapshot retrieved successfully',
  })
  async getRiskAlerts() {
    const [riskEvents, marginStatus] = await Promise.all([
      Promise.resolve(this.strategyOps.getExecutionLog().slice(-20)),
      this.binanceService.getMarginUtilization(),
    ]);

    return {
      riskEvents,
      marginStatus,
      timestamp: new Date().toISOString(),
    };
  }
}
