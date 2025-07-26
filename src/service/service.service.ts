import { Injectable } from '@nestjs/common';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class ServiceService {
  constructor(private prisma: PrismaClient) {
    this.prisma = new PrismaClient();
  }
  async create(createServiceDto: CreateServiceDto): Promise<any> {
    return await this.prisma.services.create({ 
      data: {
        name: createServiceDto.name,
        description: createServiceDto.description,
        price: createServiceDto.price,
        duration: createServiceDto.duration,
      }
  });
  } 

  async findAll(): Promise<any[]> {
    return await this.prisma.services.findMany();
  }

  async findOne(id: number): Promise<any> {
    return await this.prisma.services.findUnique({
      where: { id },
    });
  }

  update(id: number, updateServiceDto: UpdateServiceDto) {
    return `This action updates a #${id} service`;
  }

  remove(id: number) {
    return `This action removes a #${id} service`;
  }
}
