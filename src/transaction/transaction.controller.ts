import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { CreateTransferDto } from './dto/create-tranfer.dto';
import { UpdateTransferDto } from './dto/update-tranfer.dto';

@ApiTags('transfers')
@Controller('transfers')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una nueva tranferencia' })
  @ApiCreatedResponse({ description: 'La transacción fue creada exitosamente.', type: CreateTransactionDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos o transacción duplicada.' })
  async create(@Body() createTransferDto: CreateTransferDto) {
    return this.transactionService.createTranfer(createTransferDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todas las tranferencias' })
  @ApiResponse({ status: 200, description: 'Lista de transferencias obtenida correctamente.' })
  async findAll() {
    return this.transactionService.findAllTranfer();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una tranferencia por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la tranferencia a obtener' })
  @ApiResponse({ status: 200, description: 'tranferencia encontrada correctamente.' })
  @ApiNotFoundResponse({ description: 'tranferencia no encontrada con el ID proporcionado.' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.transactionService.findOneTranfer(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una tranferencia por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la tranferencia a actualizar' })
  @ApiResponse({ status: 200, description: 'Transacción actualizada correctamente.' })
  @ApiBadRequestResponse({ description: 'Datos inválidos para la actualización.' })
  @ApiNotFoundResponse({ description: 'Transacción no encontrada con el ID proporcionado.' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTransferDto: UpdateTransferDto,
  ) {
    return this.transactionService.update(id, updateTransferDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una transacción por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la transacción a eliminar' })
  @ApiResponse({ status: 200, description: 'Transacción eliminada correctamente.' })
  @ApiNotFoundResponse({ description: 'Transacción no encontrada con el ID proporcionado.' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.transactionService.remove(id);
  }
}
