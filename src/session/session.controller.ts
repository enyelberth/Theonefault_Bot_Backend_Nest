import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard } from 'src/authA/auth.guard';
import { SessionService } from './session.service';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('session')
@Controller('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  private requestUserId(req: Request): number {
    return (req as unknown as { user: { sub: number } }).user.sub;
  }

  @Get()
  @ApiOperation({
    summary: 'Get all sessions (admin only — pendiente de rol admin, ver NOTA)',
  })
  @ApiResponse({ status: 200, description: 'List of sessions' })
  findAll() {
    // NOTA: lista sesiones de TODOS los usuarios. Sin sistema de roles no hay forma
    // segura de restringirlo a admin — queda pendiente de decisión de producto.
    return this.sessionService.findAll();
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get sessions by user id (solo el propio usuario)' })
  @ApiParam({ name: 'userId', type: Number })
  @ApiResponse({ status: 200, description: 'Sessions for the given user' })
  findByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: Request,
  ) {
    if (userId !== this.requestUserId(req)) {
      throw new ForbiddenException(
        'No tienes acceso a las sesiones de este usuario',
      );
    }
    return this.sessionService.findByUser(userId);
  }
}
