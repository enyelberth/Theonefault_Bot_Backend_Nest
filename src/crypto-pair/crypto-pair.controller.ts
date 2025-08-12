import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CryptoPairService } from './crypto-pair.service';
import { CreateCryptoPairDto } from './dto/create-crypto-pair.dto';
import { UpdateCryptoPairDto } from './dto/update-crypto-pair.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';

@ApiTags('crypto-pair') // Etiqueta para agrupar las rutas en la documentación de Swagger
@Controller('crypto-pair')
export class CryptoPairController {
  constructor(private readonly cryptoPairService: CryptoPairService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new crypto pair' })
  @ApiResponse({ status: 201, description: 'The crypto pair has been successfully created.', type: CreateCryptoPairDto })
  @ApiBody({ type: CreateCryptoPairDto })
  create(@Body() createCryptoPairDto: CreateCryptoPairDto) {
    return this.cryptoPairService.create(createCryptoPairDto);
  }

  @Get()
  @ApiOperation({ summary: 'Find all crypto pairs' })
  @ApiResponse({ status: 200, description: 'Returns all crypto pairs.' })
  findAll() {
    return this.cryptoPairService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find a crypto pair by ID' })
  @ApiParam({ name: 'id', description: 'The ID of the crypto pair', example: 1 })
  @ApiResponse({ status: 200, description: 'Returns the crypto pair with the specified ID.' })
  @ApiResponse({ status: 404, description: 'Crypto pair not found.' })
  findOne(@Param('id') id: string) {
    return this.cryptoPairService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a crypto pair by ID' })
  @ApiParam({ name: 'id', description: 'The ID of the crypto pair', example: 1 })
  @ApiBody({ type: UpdateCryptoPairDto })
  @ApiResponse({ status: 200, description: 'The crypto pair has been successfully updated.' })
  @ApiResponse({ status: 404, description: 'Crypto pair not found.' })
  update(@Param('id') id: string, @Body() updateCryptoPairDto: UpdateCryptoPairDto) {
    return this.cryptoPairService.update(+id, updateCryptoPairDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a crypto pair by ID' })
  @ApiParam({ name: 'id', description: 'The ID of the crypto pair', example: 1 })
  @ApiResponse({ status: 200, description: 'The crypto pair has been successfully deleted.' })
  @ApiResponse({ status: 404, description: 'Crypto pair not found.' })
  remove(@Param('id') id: string) {
    return this.cryptoPairService.remove(+id);
  }
}