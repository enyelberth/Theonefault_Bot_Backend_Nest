import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseIntPipe, UseGuards, BadRequestException } from '@nestjs/common';
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
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from 'src/authA/auth.guard';
import { UpdateBalanceDto } from './dto/update-balance.dto';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('accounts')
@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

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
      return this.accountService.findByEmail(email);
    }
    return this.accountService.findAll();
  }

  @Get(':id/balance')
  @ApiOperation({ summary: 'Obtener el saldo de una cuenta por su ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la cuenta' })
  @ApiResponse({ status: 200, description: 'Saldo de la cuenta obtenido correctamente.' })
  @ApiNotFoundResponse({ description: 'Cuenta no encontrada o sin saldo positivo.' })
  async findAllAccountBalance(@Param('id', ParseIntPipe) id: number) {
   // return this.accountService.findAllAccountBalance(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una cuenta por su ID (incluye saldo y tipo)' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la cuenta a obtener' })
  @ApiResponse({ status: 200, description: 'Cuenta encontrada correctamente con saldos.' })
  @ApiNotFoundResponse({ description: 'Cuenta no encontrada con el ID proporcionado.' })
  async findOneWithBalance(@Param('id', ParseIntPipe) id: number) {
    return this.accountService.findOneWithBalance(id);
  }

  @Get('user/:userId/balances')
  @ApiOperation({ summary: 'Obtener cuentas de un usuario con sus saldos' })
  @ApiParam({ name: 'userId', type: Number, description: 'ID del usuario' })
  @ApiResponse({ status: 200, description: 'Cuentas del usuario obtenidas correctamente con sus saldos.' })
  @ApiNotFoundResponse({ description: 'No se encontraron cuentas para el usuario con el ID proporcionado.' })
  async findByUserIdWithBalances(@Param('userId', ParseIntPipe) userId: number) {
    return this.accountService.findByUserIdWithBalances(userId);
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

  @Patch('balance')
  @ApiOperation({ summary: 'Actualizar saldo de una criptomoneda en una cuenta' })
  @ApiResponse({ status: 200, description: 'Saldo actualizado correctamente.' })
  @ApiBadRequestResponse({ description: 'Datos inválidos para actualizar el saldo.' })
  @ApiBody({ type: UpdateBalanceDto })
  async updateCryptoBalance(@Body() updateBalanceDto: UpdateBalanceDto) {
    // Validación se asume manejada por ValidationPipe y class-transformer
    return this.accountService.updateCryptoBalance(
      updateBalanceDto.accountId,
      updateBalanceDto.currencyCode,
      updateBalanceDto.newBalance,
    );
  }
}
