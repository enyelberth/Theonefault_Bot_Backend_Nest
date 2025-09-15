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
} from '@nestjs/swagger';
import { JournalEntryService } from './journalEntry.service';
import { CreateJournalEntryDto, UpdateJournalEntryDto } from './dto/create-journalEntry.dto';

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

  // ===== JournalEntryLine Endpoints =====

  @Post(':entryId/lines')
  @ApiOperation({ summary: 'Agregar línea a una entrada del diario' })
  @ApiParam({ name: 'entryId', type: Number, description: 'ID de la entrada del diario' })
  @ApiCreatedResponse({ description: 'Línea agregada exitosamente.' })
  @ApiBadRequestResponse({ description: 'Datos inválidos para la línea.' })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async createLine(
    @Param('entryId', ParseIntPipe) entryId: number,
    @Body() lineDto: any, // Deberías crear DTO específico para línea
  ) {
    lineDto.entryId = entryId;
    return this.journalEntryService.createLine(lineDto);
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
    @Body() updateDto: any, // Crear DTO específico
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
