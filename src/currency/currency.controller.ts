import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Currency } from '@prisma/client';
import { AuthGuard } from 'src/authA/auth.guard';
import { CurrencyService } from './currency.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('currency')
@Controller('currency')
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una moneda' })
  @ApiBody({ type: CreateCurrencyDto })
  async create(@Body() createCurrencyDto: CreateCurrencyDto): Promise<Currency> {
    return this.currencyService.create(createCurrencyDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todas las monedas' })
  async findAll(): Promise<Currency[]> {
    return this.currencyService.findAll();
  }

  @Get(':code')
  @ApiOperation({ summary: 'Obtener una moneda por código' })
  @ApiParam({ name: 'code', type: String })
  async findOne(@Param('code') code: string): Promise<Currency> {
    return this.currencyService.findOne(code.toUpperCase());
  }

  @Patch(':code')
  @ApiOperation({ summary: 'Actualizar una moneda por código' })
  @ApiBody({ type: UpdateCurrencyDto })
  async update(@Param('code') code: string, @Body() updateCurrencyDto: UpdateCurrencyDto): Promise<Currency> {
    return this.currencyService.update(code.toUpperCase(), updateCurrencyDto);
  }

  @Delete(':code')
  @ApiOperation({ summary: 'Eliminar una moneda por código' })
  async remove(@Param('code') code: string): Promise<Currency> {
    return this.currencyService.remove(code.toUpperCase());
  }
}