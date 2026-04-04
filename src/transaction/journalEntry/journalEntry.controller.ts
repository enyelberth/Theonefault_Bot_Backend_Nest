import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/authA/auth.guard';
import { JournalEntryService } from './journalEntry.service';
import {
  CreateJournalEntryDto,
  CreateJournalEntryLineDto,
  SyncBinanceBalancesDto,
  UpdateJournalEntryDto,
  UpdateJournalEntryLineDto,
} from './dto/create-journalEntry.dto';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('journal-entries')
@Controller('journal-entries')
export class JournalEntryController {
  constructor(private readonly journalEntryService: JournalEntryService) {}

  // ===== JournalEntry Endpoints =====

  @Post()
  @ApiOperation({ summary: 'Crear una nueva entrada del diario' })
  @ApiCreatedResponse({
    description: 'La entrada del diario fue creada exitosamente.',
    type: CreateJournalEntryDto,
  })
  @ApiBadRequestResponse({ description: 'Datos inválidos o duplicados.' })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async create(@Body() createDto: CreateJournalEntryDto) {
    return this.journalEntryService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todas las entradas del diario' })
  @ApiResponse({ status: 200, description: 'Lista de entradas del diario obtenida correctamente.' })
  async findAll() {
    return this.journalEntryService.findAllJournalEntries();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una entrada del diario por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la entrada del diario a obtener' })
  @ApiResponse({ status: 200, description: 'Entrada del diario encontrada correctamente.' })
  @ApiNotFoundResponse({ description: 'Entrada del diario no encontrada con el ID proporcionado.' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.journalEntryService.findOneJournalEntry(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una entrada del diario por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la entrada del diario a actualizar' })
  @ApiResponse({ status: 200, description: 'Entrada del diario actualizada correctamente.' })
  @ApiBadRequestResponse({ description: 'Datos inválidos para la actualización.' })
  @ApiNotFoundResponse({ description: 'Entrada del diario no encontrada con el ID proporcionado.' })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateJournalEntryDto,
  ) {
    return this.journalEntryService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una entrada del diario por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la entrada del diario a eliminar' })
  @ApiResponse({ status: 200, description: 'Entrada del diario eliminada correctamente.' })
  @ApiNotFoundResponse({ description: 'Entrada del diario no encontrada con el ID proporcionado.' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.journalEntryService.remove(id);
  }

  @Get('accounting/summary')
  @ApiOperation({ summary: 'Obtener resumen contable de ingresos, egresos, balances y trading' })
  @ApiResponse({ status: 200, description: 'Resumen contable obtenido correctamente.' })
  async getAccountingSummary() {
    return this.journalEntryService.getAccountingSummary();
  }

  @Post('accounting/rebuild-balances')
  @ApiOperation({ summary: 'Recalcular todos los balances locales desde JournalEntryLine' })
  @ApiResponse({ status: 200, description: 'Balances recalculados correctamente.' })
  async rebuildBalances() {
    return this.journalEntryService.rebuildAllBalances();
  }

  @Post('accounting/sync-binance')
  @ApiOperation({ summary: 'Sincronizar saldos de Binance a local generando un journal entry de reflejo' })
  @ApiCreatedResponse({ description: 'Sincronización Binance aplicada correctamente.' })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos para la sincronización.' })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async syncBinanceBalances(@Body() syncDto: SyncBinanceBalancesDto) {
    return this.journalEntryService.syncBinanceBalances(syncDto);
  }

  // ===== JournalEntryLine Endpoints =====

  @Post(':entryId/lines')
  @ApiOperation({ summary: 'Agregar línea a una entrada del diario' })
  @ApiParam({ name: 'entryId', type: Number, description: 'ID de la entrada del diario' })
  @ApiCreatedResponse({ description: 'Línea agregada exitosamente.' })
  @ApiBadRequestResponse({ description: 'Datos inválidos para la línea.' })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async createLine(
    @Param('entryId', ParseIntPipe) entryId: number,
    @Body() lineDto: CreateJournalEntryLineDto,
  ) {
    return this.journalEntryService.createLine({ ...lineDto, entryId });
  }

  @Get(':entryId/lines')
  @ApiOperation({ summary: 'Obtener todas las líneas de una entrada del diario' })
  @ApiParam({ name: 'entryId', type: Number, description: 'ID de la entrada del diario' })
  @ApiResponse({ status: 200, description: 'Líneas obtenidas correctamente.' })
  async findLines(@Param('entryId', ParseIntPipe) entryId: number) {
    return this.journalEntryService.findAllLines(entryId);
  }

  @Get('lines/:id')
  @ApiOperation({ summary: 'Obtener una línea por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la línea' })
  @ApiResponse({ status: 200, description: 'Línea encontrada correctamente.' })
  @ApiNotFoundResponse({ description: 'Línea no encontrada con el ID proporcionado.' })
  async findOneLine(@Param('id', ParseIntPipe) id: number) {
    return this.journalEntryService.findOneLine(id);
  }

  @Patch('lines/:id')
  @ApiOperation({ summary: 'Actualizar una línea por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la línea' })
  @ApiResponse({ status: 200, description: 'Línea actualizada correctamente.' })
  @ApiBadRequestResponse({ description: 'Datos inválidos para la actualización.' })
  @ApiNotFoundResponse({ description: 'Línea no encontrada con el ID proporcionado.' })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async updateLine(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateJournalEntryLineDto,
  ) {
    return this.journalEntryService.updateLine(id, updateDto);
  }

  @Delete('lines/:id')
  @ApiOperation({ summary: 'Eliminar una línea por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la línea' })
  @ApiResponse({ status: 200, description: 'Línea eliminada correctamente.' })
  @ApiNotFoundResponse({ description: 'Línea no encontrada con el ID proporcionado.' })
  async removeLine(@Param('id', ParseIntPipe) id: number) {
    return this.journalEntryService.removeLine(id);
  }
}
