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

@ApiTags('transactions')
@Controller('transaction')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una nueva transacción' })
  @ApiCreatedResponse({ description: 'La transacción fue creada exitosamente.', type: CreateTransactionDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos o transacción duplicada.' })
  async create(@Body() createTransactionDto: CreateTransactionDto) {
    return this.transactionService.create(createTransactionDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todas las transacciones' })
  @ApiResponse({ status: 200, description: 'Lista de transacciones obtenida correctamente.' })
  async findAll() {
    return this.transactionService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una transacción por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la transacción a obtener' })
  @ApiResponse({ status: 200, description: 'Transacción encontrada correctamente.' })
  @ApiNotFoundResponse({ description: 'Transacción no encontrada con el ID proporcionado.' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.transactionService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una transacción por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la transacción a actualizar' })
  @ApiResponse({ status: 200, description: 'Transacción actualizada correctamente.' })
  @ApiBadRequestResponse({ description: 'Datos inválidos para la actualización.' })
  @ApiNotFoundResponse({ description: 'Transacción no encontrada con el ID proporcionado.' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTransactionDto: UpdateTransactionDto,
  ) {
    return this.transactionService.update(id, updateTransactionDto);
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
