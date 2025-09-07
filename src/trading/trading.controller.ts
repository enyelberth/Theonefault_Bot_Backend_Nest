import { Controller, Get, Post, Patch, Param, Body, Query, ParseIntPipe, BadRequestException, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBadRequestResponse, ApiNotFoundResponse, ApiCreatedResponse } from '@nestjs/swagger';
import { TradingService } from './trading.service';
import { CreateTradingOrderDto } from './dto/create-tradingOrder.dto';
import { UpdateTradingOrderDto } from './dto/update-tradingOrder.dto';
import { OrderStatus } from '@prisma/client';

@ApiTags('trading-orders')
@Controller('trading-orders')
export class TradingController {
  constructor(private readonly tradingService: TradingService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una nueva orden de trading' })
  @ApiCreatedResponse({ description: 'Orden creada exitosamente.' })
  @ApiBadRequestResponse({ description: 'Datos inválidos o saldo insuficiente.' })
  @ApiNotFoundResponse({ description: 'Cuenta o par de trading no encontrado.' })
  @ApiQuery({ name: 'cryptoPrice', description: 'Precio actual de la criptomoneda', required: true, type: Number })
  async create(
    @Body() createDto: CreateTradingOrderDto,
    @Query('cryptoPrice') cryptoPriceStr: string,
  ) {
    const cryptoPrice = Number(cryptoPriceStr);
    if (isNaN(cryptoPrice) || cryptoPrice <= 0) {
      throw new BadRequestException('cryptoPrice inválido o no proporcionado.');
    }
    return this.tradingService.createTradingOrder(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todas las órdenes de trading' })
  @ApiResponse({ status: 200, description: 'Lista de órdenes obtenida correctamente.' })
  findAll() {
    return this.tradingService.findAllTradingOrders();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una orden por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la orden' })
  @ApiResponse({ status: 200, description: 'Orden encontrada correctamente.' })
  @ApiNotFoundResponse({ description: 'Orden no encontrada.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
   // return this.tradingService.findOneTradingOrder(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar detalles de una orden' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la orden a actualizar' })
  @ApiResponse({ status: 200, description: 'Orden actualizada correctamente.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateTradingOrderDto,
  ) {
  //  return this.tradingService.updateTradingOrder(id, updateDto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Actualizar estado de una orden' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la orden' })
  @ApiQuery({ name: 'newStatus', description: 'Nuevo estado de la orden', required: true, enum: OrderStatus })
  @ApiQuery({ name: 'cryptoPrice', description: 'Precio actual de la criptomoneda', required: true, type: Number })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Query('newStatus') newStatus: OrderStatus,
    @Query('cryptoPrice') cryptoPriceStr: string,
  ) {
    const cryptoPrice = Number(cryptoPriceStr);
    if (isNaN(cryptoPrice) || cryptoPrice <= 0) {
      throw new BadRequestException('cryptoPrice inválido o no proporcionado.');
    }
  //  return this.tradingService.updateOrderStatus(id, newStatus, cryptoPrice);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una orden de trading' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la orden a eliminar' })
  @ApiResponse({ status: 200, description: 'Orden eliminada correctamente.' })
  @ApiNotFoundResponse({ description: 'Orden no encontrada.' })
  remove(@Param('id', ParseIntPipe) id: number) {
   // return this.tradingService.removeTradingOrder(id);
  }

  @Post('monitor')
  @ApiOperation({ summary: 'Monitorear el precio actual para completar órdenes LIMIT' })
  @ApiQuery({ name: 'currentPrice', description: 'Precio actual de la criptomoneda para monitoreo', required: true, type: Number })
  async monitor(@Query('currentPrice') currentPriceStr: string) {
    const currentPrice = Number(currentPriceStr);
    if (isNaN(currentPrice) || currentPrice <= 0) {
      throw new BadRequestException('currentPrice inválido o no proporcionado.');
    }
  //  await this.tradingService.monitorPricesAndCompleteOrders(currentPrice);
   // return { message: 'Monitoreo ejecutado correctamente.' };
  }
}
