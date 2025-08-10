// src/users/users.controller.ts
import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entity/user.entity';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CreateUserDto } from './dto/createUser.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { Public } from 'src/auth/auth.guard';


@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Endpoint para la primera carga automática de usuario de prueba
  @Public()
  @Post('init')
  @ApiOperation({ summary: 'Cargar usuario de prueba si no existe ninguno' })
  @ApiResponse({ status: 201, description: 'Usuario de prueba creado o ya existente.', type: User })
  async initUser() {
    return this.usersService.ensureTestUserExists();
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(AuthGuard)
  @Get()
  @ApiOperation({ summary: 'Obtener todos los usuarios' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios obtenida correctamente.', type: [User] })
  async findAll() {
    return this.usersService.findAll();
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(AuthGuard)
  @Get(':email')
  @ApiOperation({ summary: 'Obtener usuario por email' })
  @ApiResponse({ status: 200, description: 'Usuario encontrado.', type: User })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  async findOne(@Param('email') email: string) {
    return this.usersService.findOne(email);
  }

  // Endpoint público para crear usuarios normales
  @Public()
  @Post()
  @ApiOperation({ summary: 'Crear un nuevo usuario' })
  @ApiResponse({ status: 201, description: 'Usuario creado correctamente.', type: User })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createUser(createUserDto);
  }
}
