import { Injectable } from '@nestjs/common';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PromotionsService {
  constructor(private prisma: PrismaClient) {
    this.prisma = new PrismaClient();
  }
  create(createPromotionDto: CreatePromotionDto) {
    return 'This action adds a new promotion';
  }

  async findAll() {
    return await this.prisma.promotions.findMany();
  }

  async findOne(id: number) {
    return await this.prisma.promotions.findUnique({
      where: { id },
    });
  }

  async update(id: number, updatePromotionDto: UpdatePromotionDto) {
    return await this.prisma.promotions.update({
      where: { id },
      data: updatePromotionDto,
    });
  }

  async remove(id: number) {
    return await this.prisma.promotions.delete({
      where: { id },
    });
  }
}
