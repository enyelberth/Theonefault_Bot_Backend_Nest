import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RiskManagerService } from './risk-manager.service';
import {
  CreateRiskProfileDto,
  KillSwitchDto,
  UpdateRiskProfileDto,
} from './dto/risk-profile.dto';
import type { SizerSpec } from './sizing';
import type { TrailingStopConfig } from './stops/trailing-stop';
import type { TpLadderConfig } from './stops/tp-ladder';

@Controller('risk')
export class RiskController {
  constructor(private readonly risk: RiskManagerService) {}

  @Get('profiles')
  listProfiles(@Query('ownerId') ownerId?: string) {
    return this.risk.listProfiles(ownerId ? Number(ownerId) : undefined);
  }

  @Get('profiles/:id')
  getProfile(@Param('id', ParseIntPipe) id: number) {
    return this.risk.loadProfile(id);
  }

  @Post('profiles')
  create(@Body() dto: CreateRiskProfileDto) {
    return this.risk.createProfile({
      name: dto.name,
      ownerId: dto.ownerId,
      maxDrawdownPct: dto.maxDrawdownPct,
      maxDailyLossPct: dto.maxDailyLossPct,
      maxPositionSizePct: dto.maxPositionSizePct,
      maxOpenPositions: dto.maxOpenPositions,
      sizer: dto.sizer as SizerSpec | undefined,
      trailingStop: dto.trailingStop as TrailingStopConfig | undefined,
      tpLadder: dto.tpLadder as TpLadderConfig | undefined,
    });
  }

  @Patch('profiles/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRiskProfileDto) {
    return this.risk.updateProfile(id, dto as any);
  }

  @Delete('profiles/:id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.risk.deleteProfile(id);
    return { deleted: true };
  }

  @Get('kill-switch')
  killStatus(@Query('scope') scope: string = 'GLOBAL', @Query('targetId') targetId?: string) {
    return this.risk.killSwitchStatus(scope, targetId);
  }

  @Post('kill-switch')
  setKill(@Body() dto: KillSwitchDto) {
    return this.risk.setKillSwitch(
      dto.scope,
      dto.targetId ?? null,
      dto.enabled,
      dto.reason,
      dto.triggeredBy,
    );
  }
}
