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
  async addServicePromotion(idPromotion: number, idService: number) {
    try {
      console.log(typeof idPromotion)

      const promotions = await this.findOne(Number(idPromotion));
      const a = await this.moduleService.findOne(Number(idService));
      console.log(promotions);
      console.log(a);



      //Promotions Validate 
      if(promotions==null){
        console.log("Promitions invalida")
      }
      if(a==null){
        console.log("Promitions Valida")
      }
      return  await this.prisma.promotionServices.create({
        data: {
         promotionId: Number(idPromotion), 
         serviceId: Number(idService), 
        }
      });
      //console.log(promotionServices);


    // Aquí va el código para añadir la promoción al servicio
    } catch (error) {
     console.error('Error al añadir la promoción al servicio:', error);
    // Manejo del error que quieras implementar
    }
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
