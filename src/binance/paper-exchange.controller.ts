import { Controller, Get, Query, Delete } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';

@ApiBearerAuth('BearerAuth')
@ApiTags('paper-exchange')
@Controller('paper')
export class PaperExchangeController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get('orders')
  @ApiOperation({ summary: 'Listar órdenes simuladas' })
  @ApiQuery({ name: 'symbol', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['OPEN', 'FILLED', 'CANCELED'],
  })
  @ApiQuery({ name: 'botRunId', required: false, type: 'number' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  async listOrders(
    @Query('symbol') symbol?: string,
    @Query('status') status?: 'OPEN' | 'FILLED' | 'CANCELED',
    @Query('botRunId') botRunId?: string,
    @Query('limit') limit?: string,
  ) {
    const where: any = {};
    if (symbol) where.symbol = symbol.toUpperCase();
    if (status) where.status = status;
    if (botRunId) where.botRunId = Number(botRunId);
    return this.prisma.paperOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit ? Number(limit) : 200,
    });
  }

  @Get('orders/summary')
  @ApiOperation({ summary: 'Resumen paper orders por status' })
  async summary() {
    const [open, filled, canceled] = await Promise.all([
      this.prisma.paperOrder.count({ where: { status: 'OPEN' } }),
      this.prisma.paperOrder.count({ where: { status: 'FILLED' } }),
      this.prisma.paperOrder.count({ where: { status: 'CANCELED' } }),
    ]);
    return { open, filled, canceled, total: open + filled + canceled };
  }

  @Delete('orders/all')
  @ApiOperation({ summary: 'Borrar todas las paper orders (reset)' })
  async wipeAll() {
    const r = await this.prisma.paperOrder.deleteMany({});
    return { deleted: r.count };
  }
}
