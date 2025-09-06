import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { StrategiesTradingService } from './strategies-trading.service';
import { ApiBadRequestResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateStrategyTypeDto, CreateTradingStrategyDto } from './dto/create-strategies-trading.dto';
import { UpdateStrategyTypeDto, UpdateTradingStrategyDto } from './dto/update-strategies-trading.dto';
import { StrategyType, TradingStrategy } from '@prisma/client';
@ApiTags('strategies')
@Controller('strategies-trading')
export class StrategiesTradingController {
  constructor(private readonly strategiesTradingService: StrategiesTradingService) { }

  @ApiOperation({ summary: 'Crear una nueva estrategia de trading' })
  @ApiResponse({ status: 200, description: 'Estrategia de trading creada correctamente.', type: CreateTradingStrategyDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos.' })
  @Post('/createStrategy')
  async create(@Body() createStrategiesTradingDto: CreateTradingStrategyDto) {
    return await this.strategiesTradingService.createStrategies(createStrategiesTradingDto);
  }

  @ApiOperation({ summary: 'Obtener todas las estrategias de trading' })
  @ApiBadRequestResponse({ description: 'Datos inválidos.' })
  @Get('/getStrategies')
  
  async findAll(): Promise<TradingStrategy[]> {
    return await this.strategiesTradingService.getStrategies();
  }
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<TradingStrategy> {
    return await this.strategiesTradingService.getStrategyById(+id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateStrategiesTradingDto: UpdateTradingStrategyDto): Promise<TradingStrategy> {
    return await this.strategiesTradingService.updateStrategy(+id, updateStrategiesTradingDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<TradingStrategy> {
    return await this.strategiesTradingService.removeStrategy(+id);
  }

  @Post('/createTypeStrategy')
  async createType(@Body() createTypeStrategyDto: CreateStrategyTypeDto): Promise<StrategyType> {
    return await this.strategiesTradingService.createTypeStrategy(createTypeStrategyDto);
  }
  @Get('/getStrategyTypes')
  async getStrategyTypes(): Promise<StrategyType[]> {
    return await this.strategiesTradingService.getTypeStrategies();
  }
   @Get('/getStrategyType/:id')
  async findOneStrategyType(@Param('id') id: string): Promise<StrategyType> {
    return await this.strategiesTradingService.getStrategyTypeById(+id);
  }
  
  @Patch('/updateTypeStrategy/:id')
  async updateStrategyType(@Param('id') id: string, @Body() updateStrategyTypeDto: UpdateStrategyTypeDto): Promise<StrategyType> {
    return await this.strategiesTradingService.updateTypeStrategy(+id, updateStrategyTypeDto);
  }
  @Delete('/deleteTypeStrategy/:id')
  async removeStrategyType(@Param('id') id: string): Promise<StrategyType> {
    return await this.strategiesTradingService.removeTypeStrategy(+id);
  }

}
