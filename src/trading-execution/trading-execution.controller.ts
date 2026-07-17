import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/authA/auth.guard';
import { CreateTradingExecutionDto } from './dto/create-trading-execution.dto';
import { TradingExecutionService } from './trading-execution.service';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('trading-execution')
@Controller('trading-execution')
export class TradingExecutionController {
  constructor(private readonly tradingExecutionService: TradingExecutionService) {}

  @Get()
  @ApiOperation({ summary: 'Get all trading executions' })
  @ApiResponse({ status: 200, description: 'List of trading executions' })
  findAll() {
    return this.tradingExecutionService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create trading execution' })
  @ApiBody({ type: CreateTradingExecutionDto })
  @ApiResponse({ status: 201, description: 'Trading execution created' })
  create(@Body() dto: CreateTradingExecutionDto) {
    return this.tradingExecutionService.create(dto);
  }
}
