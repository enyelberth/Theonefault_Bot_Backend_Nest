import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { CryptoPairService } from './crypto-pair.service';
import { CreateCryptoPairDto } from './dto/create-crypto-pair.dto';
import { UpdateCryptoPairDto } from './dto/update-crypto-pair.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from 'src/authA/auth.guard';
import { TradingPair } from '@prisma/client';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('crypto-pair') // Etiqueta para agrupar las rutas en la documentación de Swagger
@Controller('crypto-pair')
export class CryptoPairController {
  constructor(private readonly cryptoPairService: CryptoPairService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo par de trading' })
  @ApiResponse({
    status: 201,
    description: 'El par fue creado correctamente.',
    type: CreateCryptoPairDto,
  })
  @ApiBody({ type: CreateCryptoPairDto })
  create(
    @Body() createCryptoPairDto: CreateCryptoPairDto,
  ): Promise<TradingPair> {
    return this.cryptoPairService.create(createCryptoPairDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los pares de trading' })
  @ApiResponse({ status: 200, description: 'Retorna todos los pares.' })
  findAll(): Promise<TradingPair[]> {
    return this.cryptoPairService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un par por ID' })
  @ApiParam({ name: 'id', description: 'ID del par', example: 1 })
  @ApiResponse({ status: 200, description: 'Retorna el par solicitado.' })
  @ApiResponse({ status: 404, description: 'Par no encontrado.' })
  findOne(@Param('id') id: string): Promise<TradingPair> {
    return this.cryptoPairService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un par por ID' })
  @ApiParam({ name: 'id', description: 'ID del par', example: 1 })
  @ApiBody({ type: UpdateCryptoPairDto })
  @ApiResponse({
    status: 200,
    description: 'El par fue actualizado correctamente.',
  })
  @ApiResponse({ status: 404, description: 'Par no encontrado.' })
  update(
    @Param('id') id: string,
    @Body() updateCryptoPairDto: UpdateCryptoPairDto,
  ): Promise<TradingPair> {
    return this.cryptoPairService.update(+id, updateCryptoPairDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un par por ID' })
  @ApiParam({ name: 'id', description: 'ID del par', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'El par fue eliminado correctamente.',
  })
  @ApiResponse({ status: 404, description: 'Par no encontrado.' })
  remove(@Param('id') id: string): Promise<TradingPair> {
    return this.cryptoPairService.remove(+id);
  }
}
