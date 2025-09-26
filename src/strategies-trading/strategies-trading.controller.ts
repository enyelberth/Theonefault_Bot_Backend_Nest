import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe } from '@nestjs/common';
import { StrategiesTradingService } from './strategies-trading.service';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBody,
} from '@nestjs/swagger';
import { CreateStrategyTypeDto, CreateTradingStrategyDto } from './dto/create-strategies-trading.dto';
import { UpdateStrategyTypeDto, UpdateTradingStrategyDto } from './dto/update-strategies-trading.dto';
import { StrategyType, TradingStrategy } from '@prisma/client';
import { AuthGuard } from 'src/authA/auth.guard';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('strategies')
@Controller('strategies-trading')
export class StrategiesTradingController {
  constructor(private readonly strategiesTradingService: StrategiesTradingService) { }

  @ApiOperation({ summary: 'Crear una nueva estrategia de trading' })
  @ApiBody({ type: CreateTradingStrategyDto })
  @ApiResponse({ status: 201, description: 'Estrategia de trading creada correctamente.', type: CreateTradingStrategyDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos.' })
  @Post('/createStrategy')
  async create(@Body() createStrategiesTradingDto: CreateTradingStrategyDto): Promise<CreateTradingStrategyDto> {
    return await this.strategiesTradingService.createStrategies(createStrategiesTradingDto);
  }

  @ApiOperation({ summary: 'Obtener todas las estrategias de trading' })
  @ApiResponse({ status: 200, description: 'Lista de estrategias de trading', type: [CreateTradingStrategyDto] })
  @ApiBadRequestResponse({ description: 'Error al obtener datos.' })
  @Get('/getStrategies')
  async findAll(): Promise<TradingStrategy[]> {
    return await this.strategiesTradingService.getStrategies();
  }

  @ApiOperation({ summary: 'Obtener una estrategia de trading por ID' })
  @ApiResponse({ status: 200, description: 'Estrategia de trading encontrada', type: CreateTradingStrategyDto })
  @ApiBadRequestResponse({ description: 'ID inválido' })
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: string): Promise<TradingStrategy> {
    return await this.strategiesTradingService.getStrategyById(id);
  }

  @ApiOperation({ summary: 'Actualizar una estrategia de trading' })
  @ApiBody({ type: UpdateTradingStrategyDto })
  @ApiResponse({ status: 200, description: 'Estrategia actualizada', type: CreateTradingStrategyDto })
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateStrategiesTradingDto: UpdateTradingStrategyDto,
  ): Promise<TradingStrategy> {
    return await this.strategiesTradingService.updateStrategy(id, updateStrategiesTradingDto);
  }

  @ApiOperation({ summary: 'Eliminar una estrategia de trading' })
  @ApiResponse({ status: 200, description: 'Estrategia eliminada', type: CreateTradingStrategyDto })
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<TradingStrategy> {
    return await this.strategiesTradingService.removeStrategy(id);
  }

  @ApiOperation({ summary: 'Crear un nuevo tipo de estrategia' })
  @ApiBody({ type: CreateStrategyTypeDto })
  @ApiResponse({ status: 201, description: 'Tipo de estrategia creada', type: CreateStrategyTypeDto })
  @Post('/createTypeStrategy')
  async createType(@Body() createTypeStrategyDto: CreateStrategyTypeDto): Promise<StrategyType> {
    return await this.strategiesTradingService.createTypeStrategy(createTypeStrategyDto);
  }

  @ApiOperation({ summary: 'Obtener todos los tipos de estrategias' })
  @ApiResponse({ status: 200, description: 'Lista de tipos de estrategia' })
  @Get('/getStrategyTypes/all')
  async getStrategyTypess(): Promise<any> {
    return await this.strategiesTradingService.getTypeStrategies();
  }

  @ApiOperation({ summary: 'Obtener un tipo de estrategia por ID' })
  @ApiResponse({ status: 200, description: 'Tipo de estrategia encontrada', type: CreateStrategyTypeDto })
  @Get('/getStrategyType/:id')
  async findOneStrategyType(@Param('id', ParseIntPipe) id: number): Promise<StrategyType> {
    return await this.strategiesTradingService.getStrategyTypeById(id);
  }

  @ApiOperation({ summary: 'Actualizar un tipo de estrategia' })
  @ApiBody({ type: UpdateStrategyTypeDto })
  @ApiResponse({ status: 200, description: 'Tipo de estrategia actualizada', type: CreateStrategyTypeDto })
  @Patch('/updateTypeStrategy/:id')
  async updateStrategyType(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateStrategyTypeDto: UpdateStrategyTypeDto,
  ): Promise<StrategyType> {
    return await this.strategiesTradingService.updateTypeStrategy(id, updateStrategyTypeDto);
  }

  @ApiOperation({ summary: 'Eliminar un tipo de estrategia' })
  @ApiResponse({ status: 200, description: 'Tipo de estrategia eliminada', type: CreateStrategyTypeDto })
  @Delete('/deleteTypeStrategy/:id')
  async removeStrategyType(@Param('id', ParseIntPipe) id: number): Promise<StrategyType> {
    return await this.strategiesTradingService.removeTypeStrategy(id);
  }
}
