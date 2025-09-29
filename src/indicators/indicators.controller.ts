import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { IndicatorsService } from './indicators.service';
import { CryptoPrice } from '@prisma/client';
import { AuthGuard } from 'src/authA/auth.guard';

class CreateCryptoPriceDto {
  symbol: string;
  price: number;
  volume?: number;
  timestamp: Date;
}

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('indicators')
@Controller('indicators')
export class IndicatorsController {
  constructor(private readonly indicatorsService: IndicatorsService) {}

  @Post('crypto-price')
  @ApiOperation({ summary: 'Crear nuevo precio para criptomoneda' })
  @ApiResponse({ status: 201, description: 'Precio creado exitosamente' })
  async createCryptoPrice(
    @Body() createCryptoPriceDto: CreateCryptoPriceDto,
  ): Promise<CryptoPrice> {
    return this.indicatorsService.createCryptoPrice(createCryptoPriceDto);
  }

  @Get('crypto-price/:symbol')
  @ApiOperation({ summary: 'Obtener precios históricos de una criptomoneda' })
  @ApiParam({
    name: 'symbol',
    description: 'Símbolo de la criptomoneda, ej. BTC',
  })
  @ApiResponse({ status: 200, description: 'Lista de precios históricos' })
  async findPricesBySymbol(@Param('symbol') symbol: string): Promise<CryptoPrice[]> {
    return this.indicatorsService.findPricesBySymbol(symbol);
  }

  @Get('crypto-price/latest/:symbol')
  @ApiOperation({ summary: 'Obtener el último precio registrado de una criptomoneda' })
  @ApiParam({
    name: 'symbol',
    description: 'Símbolo de la criptomoneda, ej. BTC',
  })
  @ApiResponse({ status: 200, description: 'Último precio registrado' })
  async findLatestPrice(@Param('symbol') symbol: string): Promise<CryptoPrice | null> {
    return this.indicatorsService.findLatestPrice(symbol);
  }

  // Nuevo endpoint para calcular RSI con parámetro de intervalo
  @Get('rsi/:symbol')
  @ApiOperation({ summary: 'Calcular el RSI para un símbolo y periodo dado' })
  @ApiParam({
    name: 'symbol',
    description: 'Símbolo de la criptomoneda, ej. BTC',
  })
  @ApiQuery({
    name: 'period',
    description: 'Número de períodos para calcular RSI',
    required: false,
    type: Number,
    example: 14,
  })
  @ApiQuery({
    name: 'intervalMinutes',
    description: 'Intervalo de minutos para agrupar datos (ej. 1, 16, 60)',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Valor del RSI calculado o null si no hay datos suficientes',
    type: Number,
  })
  async getRSI(
    @Param('symbol') symbol: string,
    @Query('period') period?: number,
    @Query('intervalMinutes') intervalMinutes?: number,
  ): Promise<number | null> {
    const rsiPeriod = period ?? 14;
    const rsiInterval = intervalMinutes ?? 1;
    return this.indicatorsService.calculateRSIWithInterval(symbol, rsiPeriod, rsiInterval);
  }
}
