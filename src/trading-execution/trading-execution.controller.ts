import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { TradingExecution } from '@prisma/client';
import { AuthGuard } from 'src/authA/auth.guard';
import { CreateTradingExecutionDto } from './dto/create-trading-execution.dto';
import { UpdateTradingExecutionDto } from './dto/update-trading-execution.dto';
import { TradingExecutionService } from './trading-execution.service';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('trading-execution')
@Controller('trading-execution')
export class TradingExecutionController {
  constructor(private readonly tradingExecutionService: TradingExecutionService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una ejecución de trading' })
  @ApiBody({ type: CreateTradingExecutionDto })
  async create(@Body() createTradingExecutionDto: CreateTradingExecutionDto): Promise<TradingExecution> {
    return this.tradingExecutionService.create(createTradingExecutionDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar ejecuciones' })
  async findAll(): Promise<TradingExecution[]> {
    return this.tradingExecutionService.findAll();
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Listar ejecuciones por orden' })
  @ApiParam({ name: 'orderId', type: Number })
  async findByOrderId(@Param('orderId') orderId: string): Promise<TradingExecution[]> {
    return this.tradingExecutionService.findByOrderId(+orderId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener ejecución por id' })
  async findOne(@Param('id') id: string): Promise<TradingExecution> {
    return this.tradingExecutionService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar ejecución por id' })
  @ApiBody({ type: UpdateTradingExecutionDto })
  async update(@Param('id') id: string, @Body() updateTradingExecutionDto: UpdateTradingExecutionDto): Promise<TradingExecution> {
    return this.tradingExecutionService.update(+id, updateTradingExecutionDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar ejecución por id' })
  async remove(@Param('id') id: string): Promise<TradingExecution> {
    return this.tradingExecutionService.remove(+id);
  }
}