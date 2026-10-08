import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from 'src/authA/auth.guard';
import { RiskManagerService } from './risk-manager.service';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('risk')
@Controller('risk')
export class RiskManagerController {
  constructor(private readonly risk: RiskManagerService) {}

  @Get('config')
  @ApiOperation({ summary: 'Config actual de riesgo' })
  getConfig() {
    return this.risk.getConfig();
  }

  @Patch('config')
  @ApiOperation({ summary: 'Actualizar límites de riesgo' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        maxDailyLossQuote: { type: 'number', nullable: true, example: 50 },
        maxDrawdownPct: { type: 'number', nullable: true, example: 15 },
        maxOpenBots: { type: 'number', nullable: true, example: 5 },
        maxLossPerBotQuote: { type: 'number', nullable: true, example: 20 },
        minWinRatePct: { type: 'number', nullable: true, example: 40 },
        minTradesForWinRateEval: { type: 'number', example: 20 },
      },
    },
  })
  updateConfig(@Body() body: any) {
    return this.risk.updateConfig(body);
  }

  @Post('emergency-stop')
  @ApiOperation({ summary: 'Kill switch: para TODOS los bots activos' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', example: 'manual kill switch' },
      },
    },
  })
  emergencyStop(@Body() body: { reason?: string }) {
    return this.risk.emergencyStopAll(body?.reason || 'manual');
  }

  @Post('emergency-clear')
  @ApiOperation({ summary: 'Limpia bandera de emergency-stop' })
  emergencyClear() {
    return this.risk.clearEmergencyStop();
  }

  @Post('check-now')
  @ApiOperation({ summary: 'Forzar evaluación inmediata de todas las reglas' })
  async checkNow() {
    await this.risk.checkAll();
    return { ok: true };
  }

  @Get('events')
  @ApiOperation({ summary: 'Historial de eventos de riesgo' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  listEvents(@Query('limit') limit?: string) {
    return this.risk.listEvents(limit ? Number(limit) : 100);
  }

  @Get('status')
  @ApiOperation({ summary: 'Estado breve: enabled + emergencia' })
  async status() {
    const cfg = await this.risk.getConfig();
    const active = await this.risk.isEmergencyActive();
    return {
      enabled: cfg.enabled,
      emergencyActive: active,
      emergencyStopUntil: cfg.emergencyStopUntil,
    };
  }
}
