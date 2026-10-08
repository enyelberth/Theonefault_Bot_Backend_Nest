import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReconciliationService } from './reconciliation.service';

@ApiTags('reconciliation')
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Post('run/:runId')
  @ApiOperation({ summary: 'Ejecutar reconciliación inmediata de un runner' })
  run(@Param('runId') runId: string) {
    return this.reconciliation.reconcileRun(runId, 'MANUAL');
  }

  @Get('batches')
  @ApiOperation({ summary: 'Historial de ejecuciones de reconciliación' })
  batches(@Query('runId') runId?: string, @Query('limit') limit?: string) {
    return this.reconciliation.listBatches(
      runId,
      limit === undefined ? 50 : Number(limit),
    );
  }

  @Get('issues')
  @ApiOperation({ summary: 'Incidencias abiertas o resueltas, deduplicadas' })
  issues(
    @Query('runId') runId?: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reconciliation.listIssues({
      runId,
      status,
      severity,
      limit: limit === undefined ? 100 : Number(limit),
    });
  }

  @Patch('issues/:id/resolve')
  @ApiOperation({ summary: 'Marcar una discrepancia como revisada y resuelta' })
  resolve(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { resolution?: string },
  ) {
    return this.reconciliation.resolveIssue(id, body.resolution ?? '');
  }
}
