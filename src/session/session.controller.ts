import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/authA/auth.guard';
import { SessionService } from './session.service';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('session')
@Controller('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  @ApiOperation({ summary: 'Get all sessions' })
  @ApiResponse({ status: 200, description: 'List of sessions' })
  findAll() {
    return this.sessionService.findAll();
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get sessions by user id' })
  @ApiParam({ name: 'userId', type: Number })
  @ApiResponse({ status: 200, description: 'Sessions for the given user' })
  findByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.sessionService.findByUser(userId);
  }
}
