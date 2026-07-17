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
import { PaperAccountService } from './paper-account.service';
import { PaperExchangeFactory } from './paper-exchange.factory';
import {
  CreatePaperAccountDto,
  PlacePaperOrderDto,
  UpdatePaperAccountDto,
} from './dto/create-paper-account.dto';

@Controller('paper')
export class PaperController {
  constructor(
    private readonly accounts: PaperAccountService,
    private readonly factory: PaperExchangeFactory,
  ) {}

  @Post('accounts')
  create(@Body() dto: CreatePaperAccountDto) {
    return this.accounts.create(dto);
  }

  @Get('accounts')
  list(@Query('ownerId') ownerId?: string) {
    return this.accounts.list(ownerId ? Number(ownerId) : undefined);
  }

  @Get('accounts/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.accounts.get(id);
  }

  @Patch('accounts/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePaperAccountDto) {
    return this.accounts.update(id, dto);
  }

  @Post('accounts/:id/reset')
  async reset(@Param('id', ParseIntPipe) id: number) {
    const account = await this.accounts.reset(id);
    this.factory.invalidate(id);
    return account;
  }

  @Delete('accounts/:id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.accounts.delete(id);
    this.factory.invalidate(id);
    return { deleted: true };
  }

  @Get('accounts/:id/balance')
  balance(@Param('id', ParseIntPipe) id: number) {
    return this.factory.get(id).getBalance('SPOT');
  }

  @Get('accounts/:id/positions')
  positions(@Param('id', ParseIntPipe) id: number) {
    return this.factory.get(id).getPositions();
  }

  @Get('accounts/:id/orders')
  openOrders(@Param('id', ParseIntPipe) id: number, @Query('symbol') symbol?: string) {
    return this.factory.get(id).getOpenOrders(symbol);
  }

  @Get('accounts/:id/fills')
  fills(@Param('id', ParseIntPipe) id: number, @Query('limit') limit?: string) {
    return this.accounts.listFills(id, limit ? Number(limit) : undefined);
  }

  @Post('accounts/:id/orders')
  placeOrder(@Param('id', ParseIntPipe) id: number, @Body() dto: PlacePaperOrderDto) {
    return this.factory.get(id).placeOrder({
      symbol: dto.symbol,
      side: dto.side,
      type: dto.type,
      quantity: dto.quantity,
      quoteQuantity: dto.quoteQuantity,
      price: dto.price,
      stopPrice: dto.stopPrice,
      market: 'SPOT',
    });
  }

  @Delete('accounts/:id/orders/:orderId')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Param('orderId') orderId: string,
    @Query('symbol') symbol: string,
  ) {
    return this.factory.get(id).cancelOrder(symbol, orderId);
  }
}
