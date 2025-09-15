import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { CryptoPriceService } from './crypto-price.service';
import { CreateCryptoPriceDto } from './dto/create-crypto-price.dto';
import { UpdateCryptoPriceDto } from './dto/update-crypto-price.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from 'src/authA/auth.guard';


@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('crypto-price') // Etiqueta para agrupar las rutas en la documentación de Swagger
@Controller('crypto-price')
export class CryptoPriceController {
  constructor(private readonly cryptoPriceService: CryptoPriceService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new crypto price entry' })
  @ApiResponse({ status: 201, description: 'The crypto price entry has been successfully created.' })
  @ApiBody({ type: CreateCryptoPriceDto })
  create(@Body() createCryptoPriceDto: CreateCryptoPriceDto) {
    return this.cryptoPriceService.create(createCryptoPriceDto);
  }

  @Get()
  @ApiOperation({ summary: 'Find all crypto price entries' })
  @ApiResponse({ status: 200, description: 'Returns all crypto price entries.' })
  findAll() {
    return this.cryptoPriceService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find a crypto price entry by ID' })
  @ApiParam({ name: 'id', description: 'The ID of the crypto price entry', example: 1 })
  @ApiResponse({ status: 200, description: 'Returns the crypto price entry with the specified ID.' })
  @ApiResponse({ status: 404, description: 'Crypto price entry not found.' })
  findOne(@Param('id') id: string) {
    return this.cryptoPriceService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a crypto price entry by ID' })
  @ApiParam({ name: 'id', description: 'The ID of the crypto price entry', example: 1 })
  @ApiBody({ type: UpdateCryptoPriceDto })
  @ApiResponse({ status: 200, description: 'The crypto price entry has been successfully updated.' })
  @ApiResponse({ status: 404, description: 'Crypto price entry not found.' })
  update(@Param('id') id: string, @Body() updateCryptoPriceDto: UpdateCryptoPriceDto) {
    return this.cryptoPriceService.update(+id, updateCryptoPriceDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a crypto price entry by ID' })
  @ApiParam({ name: 'id', description: 'The ID of the crypto price entry', example: 1 })
  @ApiResponse({ status: 200, description: 'The crypto price entry has been successfully deleted.' })
  @ApiResponse({ status: 404, description: 'Crypto price entry not found.' })
  remove(@Param('id') id: string) {
    return this.cryptoPriceService.remove(+id);
  }
}