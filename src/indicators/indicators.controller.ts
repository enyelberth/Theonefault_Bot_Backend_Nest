import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
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
  constructor(private readonly indicatorsService: IndicatorsService) { }

  @Post('crypto-price')
  @ApiOperation({ summary: 'Crear nuevo precio para criptomoneda' })
  @ApiResponse({ status: 201, description: 'Precio creado exitosamente' })
  async createCryptoPrice(@Body() createCryptoPriceDto: CreateCryptoPriceDto): Promise<CryptoPrice> {
    return this.indicatorsService.createCryptoPrice(createCryptoPriceDto);
  }

  @Get('crypto-price/:symbol')
  @ApiOperation({ summary: 'Obtener precios históricos de una criptomoneda' })
  @ApiParam({ name: 'symbol', description: 'Símbolo de la criptomoneda, ej. BTC' })
  @ApiResponse({ status: 200, description: 'Lista de precios históricos' })
  async findPricesBySymbol(@Param('symbol') symbol: string): Promise<CryptoPrice[]> {
    return this.indicatorsService.findPricesBySymbol(symbol);
  }

  @Get('crypto-price/latest/:symbol')
  @ApiOperation({ summary: 'Obtener el último precio registrado de una criptomoneda' })
  @ApiParam({ name: 'symbol', description: 'Símbolo de la criptomoneda, ej. BTC' })
  @ApiResponse({ status: 200, description: 'Último precio registrado' })
  async findLatestPrice(@Param('symbol') symbol: string): Promise<CryptoPrice | null> {
    return this.indicatorsService.findLatestPrice(symbol);
  }

  // Puedes agregar aquí otros endpoints para indicadores generales si quieres
}
