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
  async create(@Body() createPromotionDto: CreatePromotionDto) : Promise<any> {
    return await this.promotionsService.create(createPromotionDto);
  }
  @Public()
  @Post(':idPromotion/:idService')
  addServicePromotion(
    @Param('idPromotion') idPromotion: number,
    @Param('idService') idService: number,) {
    return this.promotionsService.addServicePromotion(idPromotion,idService);
  }
  @Public()
  @Get('getServicePromotion/:id')
  getServicePromotion(@Param('id') id:number) {
    return this.promotionsService.getServicePromotion(id);
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
