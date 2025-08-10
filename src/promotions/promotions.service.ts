import { Injectable } from '@nestjs/common';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { PrismaClient } from '@prisma/client';
import { ServiceService } from '../service/service.service'

@Injectable()
export class PromotionsService {
  constructor(private prisma: PrismaClient,private readonly moduleService:ServiceService) {
    this.prisma = new PrismaClient();
//    this.service = new ServiceService();
  }
  async create(createPromotionDto: CreatePromotionDto) : Promise<any> {
    return await this.prisma.promotions.create({
      data:{
        name: createPromotionDto.name,
        description: createPromotionDto.description,
        discount: createPromotionDto.discount,
        startDate: createPromotionDto.startDate,
        endDate:createPromotionDto.endDate,
      }
    });
  }

  async addServiceToPromotion(idPromotion: number, idService: number) {
    // Verifica si la promoción existe
    const promotion = await this.prisma.promotions.findUnique({
      where: { id: Number(idPromotion) },
    });
    if (!promotion) {
      return { message: 'El id de promotion no es válido.' };
    }

    // Verifica si el servicio existe
    const service = await this.prisma.services.findUnique({
      where: { id: Number(idService) },
    });
    if (!service) {
      return { message: 'El id de service no es válido.' };
    }

    // Verifica si la relación ya existe
    const relation = await this.prisma.promotionServices.findFirst({
      where: {
        promotionId: Number(idPromotion),
        serviceId: Number(idService),
      },
    });
    if (relation) {
      return { message: 'La relación entre la promoción y el servicio ya está registrada.' };
    }

    // Crea la relación en promotionServices
    const result = await this.prisma.promotionServices.create({
      data: {
        promotionId: Number(idPromotion),
        serviceId: Number(idService),
      },
    });

    return { message: 'Relación creada exitosamente.', data: result };
  }
  async getServicePromotion(id:number){
    try{
      const dato = await this.findOne(Number(id));
      if (dato) {
       const services = await this.prisma.services.findMany({
          where:{
            promotionServices:{
          some:{
            promotionId:Number(id)
          }
          
        }
      }
    });
        dato['children'] = services;
      console.log(dato);
      }else {
        console.log('No se encontró el registro para el id:', id);
      }

    return dato
    }catch(error){
      console.log(error);
    }
  }


  async findAll() {
    return await this.prisma.promotions.findMany();
  }

  async findAllWithServices() {
    return await this.prisma.promotions.findMany({
      include: {
        promotionServices: {
          include: {
            service: true, // Asegúrate que la relación se llama 'service' en tu esquema Prisma
          },
        },
      },
    });
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
