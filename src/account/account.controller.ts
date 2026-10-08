import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  UseGuards,
  BadRequestException,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
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

  /** `sub` del payload JWT inyectado por AuthGuard en request.user. */
  private requestUserId(req: Request): number {
    return (req as unknown as { user: { sub: number } }).user.sub;
  }

  @Post()
  @ApiOperation({ summary: 'Crear una nueva cuenta' })
  @ApiCreatedResponse({
    description: 'La cuenta fue creada exitosamente.',
    type: CreateAccountDto,
  })
  @ApiBadRequestResponse({ description: 'Datos inválidos o cuenta duplicada.' })
  async create(@Body() createAccountDto: CreateAccountDto) {
    return this.accountService.create(createAccountDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Obtener la lista de todas las cuentas o buscar por email',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de cuentas obtenida correctamente.',
  })
  @ApiQuery({
    name: 'email',
    required: false,
    description: 'Email para buscar una cuenta específica',
  })
  async findAllOrByEmail(
    @Query('email') email: string | undefined,
    @Req() req: Request,
  ) {
    if (email) {
      return this.accountService.findByEmail(email, this.requestUserId(req));
    }
    // NOTA: lista TODAS las cuentas de TODOS los usuarios. Sin sistema de roles en el
    // proyecto no hay forma segura de restringirlo a "admin" — queda pendiente de una
    // decisión de producto (agregar rol admin) en vez de romperlo a medias aquí.
    return this.accountService.findAll();
  }

  @Get(':id/balance')
  @ApiOperation({ summary: 'Obtener el saldo de una cuenta por su ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la cuenta' })
  @ApiResponse({
    status: 200,
    description: 'Saldo de la cuenta obtenido correctamente.',
  })
  @ApiNotFoundResponse({
    description: 'Cuenta no encontrada o sin saldo positivo.',
  })
  async findAllAccountBalance(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.accountService.findAllAccountBalance(
      id,
      this.requestUserId(req),
    );
  }

  @Get('balances')
  async findAllBalances() {
    // NOTA: mismo caso que findAll() arriba — lista saldos de TODAS las cuentas.
    // Pendiente de rol admin; no se restringe a medias.
    return this.accountService.findAllBalances();
  }

  @Post('balances')
  async createBalance(@Body() dto: UpdateBalanceDto, @Req() req: Request) {
    return this.accountService.createBalance(
      dto.accountId,
      dto.currencyCode,
      dto.newBalance,
      this.requestUserId(req),
    );
  }

  @Patch('balances/:balanceId')
  async updateBalanceById(
    @Param('balanceId', ParseIntPipe) balanceId: number,
    @Body() dto: UpdateBalanceDto,
    @Req() req: Request,
  ) {
    return this.accountService.updateBalanceById(
      balanceId,
      dto.newBalance,
      this.requestUserId(req),
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener una cuenta por su ID (incluye saldo y tipo)',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID de la cuenta a obtener',
  })
  @ApiResponse({
    status: 200,
    description: 'Cuenta encontrada correctamente con saldos.',
  })
  @ApiNotFoundResponse({
    description: 'Cuenta no encontrada con el ID proporcionado.',
  })
  async findOneWithBalance(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.accountService.findOneWithBalance(id, this.requestUserId(req));
  }

  @Get('user/:userId/balances')
  @ApiOperation({ summary: 'Obtener cuentas de un usuario con sus saldos' })
  @ApiParam({ name: 'userId', type: Number, description: 'ID del usuario' })
  @ApiResponse({
    status: 200,
    description: 'Cuentas del usuario obtenidas correctamente con sus saldos.',
  })
  @ApiNotFoundResponse({
    description:
      'No se encontraron cuentas para el usuario con el ID proporcionado.',
  })
  async findByUserIdWithBalances(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: Request,
  ) {
    return this.accountService.findByUserIdWithBalances(
      userId,
      this.requestUserId(req),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una cuenta por su ID' })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID de la cuenta a actualizar',
  })
  @ApiResponse({
    status: 200,
    description: 'Cuenta actualizada correctamente.',
  })
  @ApiBadRequestResponse({
    description: 'Datos inválidos para la actualización.',
  })
  @ApiNotFoundResponse({
    description: 'Cuenta no encontrada con el ID proporcionado.',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateAccountDto: UpdateAccountDto,
    @Req() req: Request,
  ) {
    return this.accountService.update(
      id,
      updateAccountDto,
      this.requestUserId(req),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una cuenta por su ID' })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID de la cuenta a eliminar',
  })
  @ApiResponse({ status: 200, description: 'Cuenta eliminada correctamente.' })
  @ApiNotFoundResponse({
    description: 'Cuenta no encontrada con el ID proporcionado.',
  })
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.accountService.remove(id, this.requestUserId(req));
  }

  @Patch('balance')
  @ApiOperation({
    summary: 'Actualizar saldo de una criptomoneda en una cuenta',
  })
  @ApiResponse({ status: 200, description: 'Saldo actualizado correctamente.' })
  @ApiBadRequestResponse({
    description: 'Datos inválidos para actualizar el saldo.',
  })
  @ApiBody({ type: UpdateBalanceDto })
  async updateCryptoBalance(
    @Body() updateBalanceDto: UpdateBalanceDto,
    @Req() req: Request,
  ) {
    // Validación se asume manejada por ValidationPipe y class-transformer
    return this.accountService.updateCryptoBalance(
      updateBalanceDto.accountId,
      updateBalanceDto.currencyCode,
      updateBalanceDto.newBalance,
      this.requestUserId(req),
    );
  }
}
