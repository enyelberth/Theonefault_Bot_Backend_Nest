import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AccountBalance } from '@prisma/client';
import { AuthGuard } from 'src/authA/auth.guard';
import { AccountBalanceService } from './account-balance.service';
import { CreateAccountBalanceDto } from './dto/create-account-balance.dto';
import { UpdateAccountBalanceDto } from './dto/update-account-balance.dto';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('account-balance')
@Controller('account-balance')
export class AccountBalanceController {
  constructor(private readonly accountBalanceService: AccountBalanceService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un balance de cuenta' })
  @ApiBody({ type: CreateAccountBalanceDto })
  async create(
    @Body() createAccountBalanceDto: CreateAccountBalanceDto,
  ): Promise<AccountBalance> {
    return this.accountBalanceService.create(createAccountBalanceDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar balances de cuenta' })
  async findAll(): Promise<AccountBalance[]> {
    return this.accountBalanceService.findAll();
  }

  @Get('account/:accountId')
  @ApiOperation({ summary: 'Listar balances por cuenta' })
  @ApiParam({ name: 'accountId', type: Number })
  async findByAccount(
    @Param('accountId') accountId: string,
  ): Promise<AccountBalance[]> {
    return this.accountBalanceService.findByAccount(+accountId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener balance por id' })
  async findOne(@Param('id') id: string): Promise<AccountBalance> {
    return this.accountBalanceService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar balance por id' })
  @ApiBody({ type: UpdateAccountBalanceDto })
  async update(
    @Param('id') id: string,
    @Body() updateAccountBalanceDto: UpdateAccountBalanceDto,
  ): Promise<AccountBalance> {
    return this.accountBalanceService.update(+id, updateAccountBalanceDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar balance por id' })
  async remove(@Param('id') id: string): Promise<AccountBalance> {
    return this.accountBalanceService.remove(+id);
  }
}
