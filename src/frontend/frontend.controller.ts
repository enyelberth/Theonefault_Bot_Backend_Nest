import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';
import { Public } from '../authA/auth.guard';

@Public()
@Controller()
export class FrontendController {
  @Get('dashboard/bot')
  botList(@Res() res: Response) {
    return res.sendFile(join(process.cwd(), 'public', 'dashboard', 'bots.html'));
  }

  @Get('dashboard/bot/:id')
  botDetail(@Res() res: Response) {
    return res.sendFile(join(process.cwd(), 'public', 'dashboard', 'bot.html'));
  }

  @Get('dashboard/analytics')
  analytics(@Res() res: Response) {
    return res.sendFile(
      join(process.cwd(), 'public', 'dashboard', 'analytics.html'),
    );
  }

  @Get('dashboard/orders')
  orders(@Res() res: Response) {
    return res.sendFile(
      join(process.cwd(), 'public', 'dashboard', 'orders.html'),
    );
  }
}
