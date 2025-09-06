import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseIntPipe } from '@nestjs/common';
import { AccountService } from './account.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('accounts') // Etiqueta general para agrupación en Swagger
@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) { }

  @Post()
  @ApiOperation({ summary: 'Crear una nueva cuenta' })
  @ApiCreatedResponse({ description: 'La cuenta fue creada exitosamente.', type: CreateAccountDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos o cuenta duplicada.' })
  async create(@Body() createAccountDto: CreateAccountDto) {
    return this.accountService.create(createAccountDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener la lista de todas las cuentas o buscar por email' })
  @ApiResponse({ status: 200, description: 'Lista de cuentas obtenida correctamente.' })
  @ApiQuery({ name: 'email', required: false, description: 'Email para buscar una cuenta específica' })
  async findAllOrByEmail(@Query('email') email?: string) {
    if (email) {
      // Si se provee email, usamos el método para buscar por email
      //return this.accountService.findByEmail(email);
    }
    return this.accountService.findAll();
  }
  @Get(':id/balance')
  @ApiOperation({ summary: 'Obtener el saldo de una cuenta por su ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la cuenta' })
  @ApiResponse({ status: 200, description: 'Saldo de la cuenta obtenido correctamente.', type: Number })
  @ApiNotFoundResponse({ description: 'Cuenta no encontrada o sin saldo positivo.' })
  async findAllAccountBalance(@Param('id', ParseIntPipe) id: number) {
    return this.accountService.findAllAccountBalance(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una cuenta por su ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la cuenta a obtener' })
  @ApiResponse({ status: 200, description: 'Cuenta encontrada correctamente.' })
  @ApiNotFoundResponse({ description: 'Cuenta no encontrada con el ID proporcionado.' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.accountService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una cuenta por su ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la cuenta a actualizar' })
  @ApiResponse({ status: 200, description: 'Cuenta actualizada correctamente.' })
  @ApiBadRequestResponse({ description: 'Datos inválidos para la actualización.' })
  @ApiNotFoundResponse({ description: 'Cuenta no encontrada con el ID proporcionado.' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() updateAccountDto: UpdateAccountDto) {
    return this.accountService.update(id, updateAccountDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una cuenta por su ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la cuenta a eliminar' })
  @ApiResponse({ status: 200, description: 'Cuenta eliminada correctamente.' })
  @ApiNotFoundResponse({ description: 'Cuenta no encontrada con el ID proporcionado.' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.accountService.remove(id);
  }
}
