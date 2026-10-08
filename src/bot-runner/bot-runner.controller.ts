import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { BotRunnerService } from './bot-runner.service';
import { StartBotDto } from './dto/start-bot.dto';

interface AuthenticatedRequest extends Request {
  user?: { sub: number; email?: string };
}

@Controller('bot-runner')
export class BotRunnerController {
  constructor(private readonly runner: BotRunnerService) {}

  @Get('strategies')
  strategies() {
    return this.runner['registry']?.list?.() ?? [];
  }

  @Post('start')
  start(@Body() dto: StartBotDto, @Req() req: AuthenticatedRequest) {
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
      // Nunca confiar en un ownerId del body: siempre el del JWT verificado.
      ownerId: req.user!.sub,
    });
  }

  @Get('history')
  history(@Req() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    return this.runner.history({
      ownerId: req.user!.sub,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.runner.list(req.user!.sub);
  }

  @Get(':runId')
  async status(
    @Param('runId') runId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.runner.assertOwnership(runId, req.user!.sub);
    return this.runner.status(runId);
  }

  @Delete(':runId')
  async stop(@Param('runId') runId: string, @Req() req: AuthenticatedRequest) {
    await this.runner.assertOwnership(runId, req.user!.sub);
    return this.runner.stop(runId);
  }

  @Get(':runId/trades')
  async trades(
    @Param('runId') runId: string,
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    await this.runner.assertOwnership(runId, req.user!.sub);
    return this.runner.trades(runId, limit ? Number(limit) : undefined);
  }

  @Get(':runId/snapshots')
  async snapshots(
    @Param('runId') runId: string,
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    await this.runner.assertOwnership(runId, req.user!.sub);
    return this.runner.snapshots(runId, limit ? Number(limit) : undefined);
  }

  @Get(':runId/traces')
  async traces(
    @Param('runId') runId: string,
    @Req() req: AuthenticatedRequest,
    @Query('correlationId') correlationId?: string,
    @Query('eventType') eventType?: string,
    @Query('limit') limit?: string,
  ) {
    await this.runner.assertOwnership(runId, req.user!.sub);
    return this.runner.traces(runId, {
      correlationId,
      eventType,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
