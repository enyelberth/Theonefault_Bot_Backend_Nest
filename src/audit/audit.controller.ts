import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuditService, ListAuditEventsFilters } from './audit.service';

const positiveInt = (value: string | undefined, name: string, max: number) => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new BadRequestException(
      `${name} must be an integer from 1 to ${max}`,
    );
  }
  return parsed;
};

@ApiTags('audit')
@Controller('audit-events')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Lista eventos técnicos de auditoría HTTP' })
  @ApiQuery({ name: 'requestId', required: false })
  @ApiQuery({ name: 'userId', required: false, type: 'number' })
  @ApiQuery({ name: 'path', required: false })
  @ApiQuery({ name: 'statusCode', required: false, type: 'number' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  async list(
    @Query('requestId') requestId?: string,
    @Query('userId') userIdRaw?: string,
    @Query('path') path?: string,
    @Query('statusCode') statusCodeRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const userId = positiveInt(userIdRaw, 'userId', Number.MAX_SAFE_INTEGER);
    const statusCode = positiveInt(statusCodeRaw, 'statusCode', 599);
    const limit = positiveInt(limitRaw, 'limit', 500);
    const filters: ListAuditEventsFilters = {
      requestId,
      userId,
      path,
      statusCode,
      limit,
    };
    return this.audit.list(filters);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Resume latencia y errores de auditoría HTTP' })
  @ApiQuery({ name: 'hours', required: false, type: 'number' })
  summary(@Query('hours') hoursRaw?: string) {
    const hours = positiveInt(hoursRaw, 'hours', 168);
    return this.audit.summary(hours ?? 24);
  }
}
