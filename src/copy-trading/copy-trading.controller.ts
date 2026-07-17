import {
  Body,
  Controller,
  Delete,
  Get,
  MessageEvent,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { CopySignalBus, CopySignalEvent } from './copy-signal.bus';
import { CopyTradingService } from './copy-trading.service';
import { CreateMasterDto } from './dto/create-master.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

@ApiTags('copy-trading')
@Controller('copy-trading')
export class CopyTradingController {
  constructor(
    private readonly bus: CopySignalBus,
    private readonly service: CopyTradingService,
  ) {}

  @Post('masters')
  createMaster(@Body() dto: CreateMasterDto) {
    return this.service.registerMaster(dto);
  }

  @Get('masters')
  listMasters() {
    return this.service.listMasters();
  }

  @Patch('masters/:id/active')
  setActive(@Param('id', ParseIntPipe) id: number, @Query('value') value: string) {
    return this.service.setActive(id, value !== 'false');
  }

  @Post('subscriptions')
  subscribe(@Body() dto: CreateSubscriptionDto) {
    return this.service.subscribe(dto);
  }

  @Get('masters/:id/subscriptions')
  listSubscriptions(@Param('id', ParseIntPipe) id: number) {
    return this.service.listSubscriptions(id);
  }

  @Delete('subscriptions/:id')
  async unsubscribe(@Param('id', ParseIntPipe) id: number) {
    await this.service.unsubscribeById(id);
    return { deleted: id };
  }

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const unsubscribe = this.bus.subscribe((event: CopySignalEvent) => {
        subscriber.next({ data: event });
      });
      return () => unsubscribe();
    });
  }
}
