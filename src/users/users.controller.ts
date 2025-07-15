// src/users/users.controller.ts
import { Controller, Get, Post, Delete, Param, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
//import { User } from '@prisma/client';
import { User } from './entity/user.entity';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CreateUserDto } from './dto/createUser.dto';
import { AuthGuard } from 'src/auth/auth.guard';
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
@ApiBearerAuth('BearerAuth') // El nombre debe coincidir con el del DocumentBuilder
@UseGuards(AuthGuard)
  @Get()
  @ApiOperation({ summary: 'Obtener todos los usuarios' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios obtenida correctamente.', type: [User] })
  async findAll()  {
    console.log('Fetching all users');
    return this.usersService.findAll();
  }

  @Get(':email')
  @ApiOperation({ summary: 'Obtener usuario por email' })
  @ApiResponse({ status: 200, description: 'Usuario encontrado.', type: User })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
async findOne(@Param('email') email: string) {
    return  this.usersService.findOne(email);
  }

   @Post()
   @ApiOperation({ summary: 'Crear un nuevo usuario' })
   @ApiResponse({ status: 201, description: 'Usuario creado correctamente.', type: User })
   @ApiResponse({ status: 400, description: 'Datos inválidos.' })
   async create(@Body() createUserDto: CreateUserDto) {
     return this.usersService.createUser(createUserDto);
   }

  // @Delete(':id')
  // @ApiOperation({ summary: 'Eliminar usuario por ID' })
  // @ApiResponse({ status: 200, description: 'Usuario eliminado correctamente.', type: User })
  // @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  // async remove(@Param('id', ParseIntPipe) id: number): Promise<User> {
  //   return this.usersService.deleteUser(id);
  // }
}
