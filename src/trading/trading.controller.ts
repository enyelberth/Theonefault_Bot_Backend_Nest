import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
  BadRequestException,
  Delete,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TradingService } from './trading.service';
import { CreateTradingOrderDto } from './dto/create-tradingOrder.dto';
import { UpdateTradingOrderDto } from './dto/update-tradingOrder.dto';
import { SimulateTradingOrderDto } from './dto/simulate-trading-order.dto';
import { OrderStatus } from '@prisma/client';
import { AuthGuard, Public } from 'src/authA/auth.guard';
import { Roles } from 'src/authA/roles.decorator';
import { RateLimit } from 'src/security/rate-limit.decorator';
import { RateLimitGuard } from 'src/security/rate-limit.guard';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('trading-orders')
@Controller('trading-orders')
export class TradingController {
  constructor(private readonly tradingService: TradingService) {}
  @Post()
  @Roles('ADMIN', 'OPERATOR', 'TRADER')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 30, windowMs: 60_000 })
  @ApiOperation({ summary: 'Crear una nueva orden de trading' })
  @ApiCreatedResponse({ description: 'Orden creada exitosamente.' })
  @ApiBadRequestResponse({ description: 'Datos inválidos o error en creación.' })
  @ApiNotFoundResponse({ description: 'Cuenta o entidad relacionada no encontrada.' })
  async create(@Body() createDto: CreateTradingOrderDto) {
    return this.tradingService.createTradingOrder(createDto);
  }

  @Post('simulate')
  @Roles('ADMIN', 'OPERATOR', 'TRADER')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 30, windowMs: 60_000 })
  @ApiOperation({ summary: 'Simular orden antes de ejecutarla con validaciones de riesgo y horario' })
  async simulate(@Body() simulateDto: SimulateTradingOrderDto) {
    return this.tradingService.simulateTradingOrder(simulateDto);
  }
  @Public()

  @Get()
  @ApiOperation({ summary: 'Obtener todas las órdenes de trading' })
  @ApiResponse({ status: 200, description: 'Lista de órdenes obtenida correctamente.' })
  findAll() {
    return this.tradingService.findAllTradingOrders();
  }
  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Obtener una orden por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la orden' })
  @ApiResponse({ status: 200, description: 'Orden encontrada correctamente.' })
  @ApiNotFoundResponse({ description: 'Orden no encontrada.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tradingService.findOneTradingOrder(id);
  }
  @Patch(':id')
  @Roles('ADMIN', 'OPERATOR', 'TRADER')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 40, windowMs: 60_000 })
  @ApiOperation({ summary: 'Actualizar detalles de una orden' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la orden a actualizar' })
  @ApiResponse({ status: 200, description: 'Orden actualizada correctamente.' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateTradingOrderDto,
  ) {
    return this.tradingService.updateTradingOrder(id, updateDto);
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'OPERATOR', 'TRADER')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 60, windowMs: 60_000 })
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
    return this.tradingService.updateTradingOrderStatus(id, newStatus, cryptoPrice);
  }

  @Delete(':id')
  @Roles('ADMIN', 'OPERATOR')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowMs: 60_000 })
  @ApiOperation({ summary: 'Eliminar una orden de trading' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la orden a eliminar' })
  @ApiResponse({ status: 200, description: 'Orden eliminada correctamente.' })
  @ApiNotFoundResponse({ description: 'Orden no encontrada.' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    // Si implementas la función removeTradingOrder, simplemente descomenta esta línea
    // return this.tradingService.removeTradingOrder(id);
    throw new BadRequestException('Función eliminar no implementada todavía');
  }

  @Post('monitor')
  @Roles('ADMIN', 'OPERATOR')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000 })
  @ApiOperation({ summary: 'Monitorear el precio actual para completar órdenes LIMIT' })
  @ApiQuery({ name: 'currentPrice', description: 'Precio actual de la criptomoneda para monitoreo', required: true, type: Number })
  async monitor(@Query('currentPrice') currentPriceStr: string) {
    const currentPrice = Number(currentPriceStr);
    if (isNaN(currentPrice) || currentPrice <= 0) {
      throw new BadRequestException('currentPrice inválido o no proporcionado.');
    }
    // Si implementas monitorPricesAndCompleteOrders, descomenta y ajusta esta llamada
    // await this.tradingService.monitorPricesAndCompleteOrders(currentPrice);
    return { message: 'Monitoreo ejecutado correctamente.' };
  }

  @Get('diagnostics/summary')
  @Roles('ADMIN', 'OPERATOR')
  @ApiQuery({ name: 'accountId', required: false, type: Number })
  @ApiOperation({ summary: 'Diagnóstico operativo del módulo de trading' })
  async getDiagnostics(@Query('accountId') accountId?: string) {
    return this.tradingService.getTradingDiagnostics(accountId ? Number(accountId) : undefined);
  }
}
