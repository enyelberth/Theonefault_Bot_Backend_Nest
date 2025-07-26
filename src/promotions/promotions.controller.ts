import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { ApiTags } from '@nestjs/swagger';
import { Public } from 'src/auth/auth.guard';
@ApiTags('Promotions')
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}
  @Public()
  @Post()
  create(@Body() createPromotionDto: CreatePromotionDto) {
    return this.promotionsService.create(createPromotionDto);
  }
  @Public()
  @Get()
  findAll() {
    return this.promotionsService.findAll();
  }
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.promotionsService.findOne(+id);
  }
  @Public()
  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePromotionDto: UpdatePromotionDto) {
    return this.promotionsService.update(+id, updatePromotionDto);
  }
  @Public()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.promotionsService.remove(+id);
  }
}
