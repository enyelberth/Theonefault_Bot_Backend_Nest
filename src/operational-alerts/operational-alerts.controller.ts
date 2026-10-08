import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  AlertSeverity,
  ListAlertsFilters,
  OperationalAlertsService,
} from './operational-alerts.service';

const SEVERITIES: AlertSeverity[] = ['INFO', 'WARN', 'ERROR', 'CRITICAL'];

@ApiTags('alerts')
@Controller('alerts')
export class OperationalAlertsController {
  constructor(private readonly alerts: OperationalAlertsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista alertas operativas con dedupe' })
  @ApiQuery({ name: 'severity', required: false, enum: SEVERITIES })
  @ApiQuery({ name: 'kind', required: false })
  @ApiQuery({ name: 'onlyUnacknowledged', required: false, type: 'boolean' })
  @ApiQuery({ name: 'botRunnerRunId', required: false, type: 'number' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  async list(
    @Query('severity') severity?: string,
    @Query('kind') kind?: string,
    @Query('onlyUnacknowledged') onlyUnacknowledged?: string,
    @Query('botRunnerRunId') botRunnerRunId?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: ListAlertsFilters = {};
    if (severity) {
      if (!SEVERITIES.includes(severity as AlertSeverity)) {
        throw new BadRequestException(
          `severity must be one of ${SEVERITIES.join(', ')}`,
        );
      }
      filters.severity = severity as AlertSeverity;
    }
    if (kind) filters.kind = kind;
    if (onlyUnacknowledged === 'true' || onlyUnacknowledged === '1') {
      filters.onlyUnacknowledged = true;
    }
    if (botRunnerRunId !== undefined) {
      const n = Number(botRunnerRunId);
      if (!Number.isInteger(n) || n <= 0) {
        throw new BadRequestException(
          'botRunnerRunId must be positive integer',
        );
      }
      filters.botRunnerRunId = n;
    }
    if (limit !== undefined) {
      const n = Number(limit);
      if (!Number.isInteger(n) || n < 1 || n > 500) {
        throw new BadRequestException('limit must be 1..500');
      }
      filters.limit = n;
    }
    return this.alerts.list(filters);
  }

  @Post(':id/ack')
  @ApiOperation({ summary: 'Reconoce alerta (limpia hasta próximo dispatch)' })
  ack(
    @Param('id') id: string,
    @Body('acknowledgedBy') acknowledgedBy?: string,
  ) {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestException('id must be positive integer');
    }
    return this.alerts.acknowledge(n, acknowledgedBy);
  }
}
