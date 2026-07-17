import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { BacktestingService } from './backtesting.service';
import { RunBacktestDto } from './dto/run-backtest.dto';

@Controller('backtest')
export class BacktestingController {
  constructor(private readonly service: BacktestingService) {}

  @Get('strategies')
  strategies() {
    return this.service.listStrategies();
  }

  @Post('run')
  run(@Body() dto: RunBacktestDto) {
    return this.service.run(dto);
  }

  @Get()
  list(@Query('limit') limit?: string) {
    return this.service.list(limit ? Number(limit) : undefined);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.service.get(id);
  }

  @Get(':id/trades')
  trades(@Param('id', ParseIntPipe) id: number) {
    return this.service.getTrades(id);
  }
}
