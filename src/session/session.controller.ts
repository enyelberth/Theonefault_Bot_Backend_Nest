import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Session } from '@prisma/client';
import { AuthGuard } from 'src/authA/auth.guard';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionService } from './session.service';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('session')
@Controller('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una sesión' })
  @ApiBody({ type: CreateSessionDto })
  async create(@Body() createSessionDto: CreateSessionDto): Promise<Session> {
    return this.sessionService.create(createSessionDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar sesiones' })
  async findAll(): Promise<Session[]> {
    return this.sessionService.findAll();
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Listar sesiones por usuario' })
  @ApiParam({ name: 'userId', type: Number })
  async findByUserId(@Param('userId') userId: string): Promise<Session[]> {
    return this.sessionService.findByUserId(+userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener sesión por id' })
  @ApiParam({ name: 'id', type: Number })
  async findOne(@Param('id') id: string): Promise<Session> {
    return this.sessionService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar sesión por id' })
  @ApiBody({ type: UpdateSessionDto })
  @ApiParam({ name: 'id', type: Number })
  async update(@Param('id') id: string, @Body() updateSessionDto: UpdateSessionDto): Promise<Session> {
    return this.sessionService.update(+id, updateSessionDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar sesión por id' })
  @ApiResponse({ status: 200, description: 'Sesión eliminada' })
  async remove(@Param('id') id: string): Promise<Session> {
    return this.sessionService.remove(+id);
  }
}