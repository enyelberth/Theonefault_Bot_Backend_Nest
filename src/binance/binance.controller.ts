import { Controller, Get, Post, Param, Body, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiCreatedResponse, ApiBadRequestResponse, ApiNotFoundResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { BinanceService } from './binance.service';
import { CreateLimitOrderDto, CreateMarketOrderDto, CreateOcoOrderDto } from './dto/create-binance.dto';
import { AuthGuard } from 'src/authA/auth.guard';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('binance')
@Controller('binance')
export class BinanceController {
  constructor(private readonly binanceService: BinanceService) { }

  @Get('account-info')
  @ApiOperation({ summary: 'Obtener información completa de la cuenta' })
  @ApiResponse({ status: 200, description: 'Información de la cuenta obtenida correctamente.' })
  async getAccountInfo() {
    return this.binanceService.getAccountInfo();
  }

  @Get('account-balance')
  @ApiOperation({ summary: 'Obtener información del balance de la cuenta' })
  @ApiResponse({ status: 200, description: 'Información del balance de la cuenta obtenida correctamente.' })
  async getAccountBalance() {
    return this.binanceService.getNonZeroBalances();
  }

  @Get('balance/spot')
  @ApiOperation({ summary: 'Obtener saldo de fondos Spot' })
  @ApiResponse({ status: 200, description: 'Saldo spot obtenido correctamente.' })
  async getSpotBalances() {
    return this.binanceService.getNonZeroBalances();
  }

  @Get('balance/margin/cross')
  @ApiOperation({ summary: 'Obtener saldo de margen cruzado' })
  @ApiResponse({ status: 200, description: 'Saldo de margin cruzado obtenido correctamente.' })
  async getCrossMarginBalances() {
    return this.binanceService.getCrossMarginLoans();
  }

  @Get('balance/margin/isolated')
  @ApiOperation({ summary: 'Obtener saldo de margen aislado' })
  @ApiResponse({ status: 200, description: 'Saldo de margin aislado obtenido correctamente.' })
  async getIsolatedMarginBalances() {
    return this.binanceService.getIsolatedMarginBalances();
  }

  @Post('order/limit')
  @ApiOperation({ summary: 'Crear una orden limit' })
  @ApiCreatedResponse({ description: 'Orden limit creada correctamente.', type: CreateLimitOrderDto })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos.' })
  async createLimitOrder(@Body() dto: CreateLimitOrderDto) {
    return this.binanceService.createLimitOrder(dto.symbol, dto.side, dto.quantity, dto.price, dto.timeInForce);
  }

  @Post('order/market')
  @ApiOperation({ summary: 'Crear una orden market' })
  @ApiCreatedResponse({ description: 'Orden market creada correctamente.' })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos.' })
  async createMarketOrder(@Body() dto: CreateMarketOrderDto) {
    return this.binanceService.createMarketOrder(dto.symbol, dto.side, dto.quantity);
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
  @ApiCreatedResponse({ description: 'Orden OCO margin cruzado creada correctamente.' })
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
  @ApiCreatedResponse({ description: 'Orden limit margin cruzado creada correctamente.', type: CreateLimitOrderDto })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos.' })
  async createCrossMarginLimitOrder(@Body() dto: CreateLimitOrderDto) {
    console.log('Received DTO:', dto);
    return this.binanceService.createCrossMarginLimitOrder(dto.symbol, dto.side, dto.quantity, dto.price, dto.timeInForce);
  }

  @Post('order/market/cross')
  @ApiOperation({ summary: 'Crear una orden market en margin cruzado' })
  @ApiCreatedResponse({ description: 'Orden market margin cruzado creada correctamente.' })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos.' })
  async createCrossMarginMarketOrder(@Body() dto: CreateMarketOrderDto) {
    return this.binanceService.createCrossMarginMarketOrder(dto.symbol, dto.side, dto.quantity);
  }

  @Post('order/limit/isolated')
  @ApiOperation({ summary: 'Crear una orden limit en margin aislado' })
  @ApiCreatedResponse({ description: 'Orden limit margin aislado creada correctamente.', type: CreateLimitOrderDto })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos.' })
  async createIsolatedMarginLimitOrder(@Body() dto: CreateLimitOrderDto) {
    return this.binanceService.createIsolatedMarginLimitOrder(dto.symbol, dto.side, dto.quantity, dto.price, dto.timeInForce);
  }

  @Post('order/market/isolated')
  @ApiOperation({ summary: 'Crear una orden market en margin aislado' })
  @ApiCreatedResponse({ description: 'Orden market margin aislado creada correctamente.' })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos.' })
  async createIsolatedMarginMarketOrder(@Body() dto: CreateMarketOrderDto) {
    return this.binanceService.createIsolatedMarginMarketOrder(dto.symbol, dto.side, dto.quantity);
  }

  @Get('order/:symbol/:orderId')
  @ApiOperation({ summary: 'Consultar estado de una orden' })
  @ApiParam({ name: 'symbol', type: String, description: 'Símbolo del par (ej. BTCUSDT)' })
  @ApiParam({ name: 'orderId', type: Number, description: 'ID de la orden' })
  @ApiResponse({ status: 200, description: 'Estado de la orden obtenido correctamente.' })
  @ApiNotFoundResponse({ description: 'Orden no encontrada.' })
  async getOrderStatus(
    @Param('symbol') symbol: string,
    @Param('orderId', ParseIntPipe) orderId: number
  ) {
    return this.binanceService.checkOrderStatus(symbol, orderId);
  }
  @Post('margin-cross/orders/cancel/:symbol')
  @ApiOperation({ summary: 'Cancelar todas las órdenes margin cruzado abiertas para un símbolo y lado' })
  @ApiParam({ name: 'symbol', type: String, description: 'Símbolo del par (ej. BTCUSDT)' })
  @ApiQuery({ name: 'side', required: true, enum: ['BUY', 'SELL'], description: 'Lado de la orden a cancelar: BUY o SELL' })
  @ApiResponse({ status: 200, description: 'Órdenes margin cruzado canceladas correctamente.' })
  async cancelAllCrossMarginOrdersBySide(
    @Param('symbol') symbol: string,
    @Query('side') side: 'BUY' | 'SELL'
  ) {
    return this.binanceService.cancelAllCrossMarginOrdersBySide(symbol, side);
  }

  @Get('orders/:symbol')
  @ApiOperation({ summary: 'Obtener todas las órdenes de un símbolo' })
  @ApiParam({ name: 'symbol', type: String, description: 'Símbolo del par, ej. BTCUSDT' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Cantidad máxima de órdenes a obtener' })
  @ApiQuery({ name: 'fromId', required: false, type: Number, description: 'ID desde donde iniciar la búsqueda' })
  @ApiResponse({ status: 200, description: 'Órdenes obtenidas correctamente.' })
  async getAllOrders(
    @Param('symbol') symbol: string,
    @Query('limit') limit?: number,
    @Query('fromId') fromId?: number,
  ) {
    return this.binanceService.getAllOrders(symbol, limit ?? 500, fromId);
  }

  @Post('orders/cancel-all/:symbol')
  @ApiOperation({ summary: 'Cancelar todas las órdenes abiertas de un símbolo' })
  @ApiParam({ name: 'symbol', type: String, description: 'Símbolo del par, ej. LINKUSDT' })
  @ApiResponse({ status: 200, description: 'Órdenes canceladas correctamente.' })
  async cancelAllOrders(@Param('symbol') symbol: string) {
    return this.binanceService.cancelAllOrders(symbol);
  }



  @Get('margin-cross/orders/:symbol')
  @ApiOperation({ summary: 'Obtener todas las órdenes margin cruzado para un símbolo' })
  @ApiParam({ name: 'symbol', type: String, description: 'Símbolo del par (ej. BTCUSDT)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Límite máximo de órdenes a obtener' })
  @ApiQuery({ name: 'fromId', required: false, type: Number, description: 'ID para paginación' })
  @ApiResponse({ status: 200, description: 'Órdenes margin cruzado obtenidas correctamente.' })
  async getAllCrossMarginOrders(
    @Param('symbol') symbol: string,
    @Query('limit') limit?: number,
    @Query('fromId') fromId?: number,
  ) {
    return this.binanceService.getAllCrossMarginOrders(symbol, limit ?? 500, fromId);
  }

  @Get('margin-cross/order/:symbol/:orderId')
  @ApiOperation({ summary: 'Consultar una orden margin cruzado específica' })
  @ApiParam({ name: 'symbol', type: String, description: 'Símbolo del par (ej. BTCUSDT)' })
  @ApiParam({ name: 'orderId', type: Number, description: 'ID de la orden' })
  @ApiResponse({ status: 200, description: 'Orden margin cruzado obtenida correctamente.' })
  async getCrossMarginOrderStatus(
    @Param('symbol') symbol: string,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.binanceService.getCrossMarginOrderStatus(symbol, orderId);
  }

  @Post('margin-cross/orders/cancel-all/:symbol')
  @ApiOperation({ summary: 'Cancelar todas las órdenes margin cruzado abiertas para un símbolo' })
  @ApiParam({ name: 'symbol', type: String, description: 'Símbolo del par (ej. BTCUSDT)' })
  @ApiResponse({ status: 200, description: 'Órdenes margin cruzado canceladas correctamente.' })
  async cancelAllCrossMarginOrders(@Param('symbol') symbol: string) {
    return this.binanceService.cancelAllCrossMarginOrders(symbol);
  }
  @Post('margin-cross/order/cancel/:symbol/:orderId')
  @ApiOperation({ summary: 'Cancelar una orden margin cruzado' })
  @ApiParam({ name: 'symbol', type: String, description: 'Símbolo del par (ej. BTCUSDT)' })
  @ApiParam({ name: 'orderId', type: Number, description: 'ID de la orden' })
  @ApiResponse({ status: 200, description: 'Orden margin cruzado cancelada correctamente.' })
  async cancelCrossMarginOrder(
    @Param('symbol') symbol: string,
    @Param('orderId', ParseIntPipe) orderId: number
  ) {
    return this.binanceService.cancelCrossMarginOrder(symbol, orderId);
  }
}
