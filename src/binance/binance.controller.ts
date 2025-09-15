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
  constructor(private readonly binanceService: BinanceService) {}

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

  @Post('order/limit')
  @ApiOperation({ summary: 'Crear una orden limit'})
  @ApiCreatedResponse({ description: 'Orden limit creada correctamente.', type: CreateLimitOrderDto  })
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

  // Nuevo endpoint para cancelar todas las órdenes de un símbolo
  @Post('orders/cancel-all/:symbol')
  @ApiOperation({ summary: 'Cancelar todas las órdenes abiertas de un símbolo' })
  @ApiParam({ name: 'symbol', type: String, description: 'Símbolo del par, ej. LINKUSDT' })
  @ApiResponse({ status: 200, description: 'Órdenes canceladas correctamente.' })
  async cancelAllOrders(@Param('symbol') symbol: string) {
    return this.binanceService.cancelAllOrders(symbol);
  }
}
