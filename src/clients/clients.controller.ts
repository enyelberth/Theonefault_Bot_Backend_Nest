import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Public } from 'src/auth/auth.guard';
import { ApiTags } from '@nestjs/swagger';
@ApiTags('clients')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}
  @Public()
  @Post()
  async create(@Body() createClientDto: CreateClientDto) : Promise<any[]> {
    return this.clientsService.create(createClientDto);
  }
  @Public()

  @Get()
  async findAll(): Promise<any[]> {
    return await this.clientsService.findAll();
  }
  @Public()

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(+id);
  }

  @Public()
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateClientDto: UpdateClientDto) {
    return this.clientsService.update(+id, updateClientDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clientsService.remove(+id);
  }

  @Public()
  @Get('email/:email')
  async findByEmail(@Param('email') email: string) {
    return this.clientsService.findByEmail(email);
  }

  @Public()
  @Get('phone/:phone')
  async findByPhone(@Param('phone') phone: string) {
    return this.clientsService.findByPhone(phone);
  }
}
