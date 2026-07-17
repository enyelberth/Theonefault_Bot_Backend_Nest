import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { BotRunnerService } from './bot-runner.service';
import { StartBotDto } from './dto/start-bot.dto';

@Controller('bot-runner')
export class BotRunnerController {
  constructor(private readonly runner: BotRunnerService) {}

  @Get('strategies')
  strategies() {
    return this.runner['registry']?.list?.() ?? [];
  }

  @Post('start')
  start(@Body() dto: StartBotDto) {
    return this.runner.start({
      runId: dto.runId,
      strategyId: dto.strategyId,
      symbol: dto.symbol,
      timeframe: dto.timeframe,
      config: dto.config,
      exchange: dto.exchange,
      pollMs: dto.pollMs,
      warmupBars: dto.warmupBars,
      riskProfileId: dto.riskProfileId,
    });
  }

  @Get('history')
  history(@Query('ownerId') ownerId?: string, @Query('limit') limit?: string) {
    return this.runner.history({
      ownerId: ownerId ? Number(ownerId) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get()
  list() {
    return this.runner.list();
  }

  @Get(':runId')
  status(@Param('runId') runId: string) {
    return this.runner.status(runId);
  }

  @Delete(':runId')
  stop(@Param('runId') runId: string) {
    return this.runner.stop(runId);
  }

  @Get(':runId/trades')
  trades(@Param('runId') runId: string, @Query('limit') limit?: string) {
    return this.runner.trades(runId, limit ? Number(limit) : undefined);
  }

  @Get(':runId/snapshots')
  snapshots(@Param('runId') runId: string, @Query('limit') limit?: string) {
    return this.runner.snapshots(runId, limit ? Number(limit) : undefined);
  }
}
