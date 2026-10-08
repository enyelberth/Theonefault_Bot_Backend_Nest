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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/authA/auth.guard';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { CurrencyService } from './currency.service';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('currency')
@Controller('currency')
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}
  @Get() findAll() {
    return this.currencyService.findAll();
  }
  @Get(':code') findOne(@Param('code') code: string) {
    return this.currencyService.findOne(code);
  }
  @Post() create(@Body() dto: CreateCurrencyDto) {
    return this.currencyService.create(dto);
  }
  @Patch(':code') update(
    @Param('code') code: string,
    @Body() dto: UpdateCurrencyDto,
  ) {
    return this.currencyService.update(code, dto);
  }
  @Delete(':code') remove(@Param('code') code: string) {
    return this.currencyService.remove(code);
  }
}
