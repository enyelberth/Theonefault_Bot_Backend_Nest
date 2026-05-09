import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from 'src/authA/auth.guard';
import { Roles } from 'src/authA/roles.decorator';
import { ObservabilityService } from './observability.service';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('observability')
@Controller('observability')
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get('health')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Dashboard de salud por modulo' })
  getHealth() {
    return {
      generatedAt: new Date().toISOString(),
      modules: this.observabilityService.getModuleHealthSummary(),
    };
  }

  @Get('events')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Catalogo de eventos criticos del dominio' })
  @ApiQuery({ name: 'module', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getEvents(@Query('module') module?: string, @Query('limit') limit?: string) {
    return this.observabilityService.getDomainEvents(
      module,
      limit ? Number(limit) : 100,
    );
  }
}
