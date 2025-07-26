import { Injectable } from '@nestjs/common';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { PrismaClient, Services } from '@prisma/client';
import { Service } from 'src/service/entities/service.entity';
@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaClient) {
    this.prisma = new PrismaClient();
  }
  async create(createClientDto: CreateClientDto): Promise<any> {
    return await this.prisma.clients.create({
      data: {
        name: createClientDto.name,
        secondName: createClientDto.secondName,
        email: createClientDto.email,
        phone: createClientDto.phone,
        address: createClientDto.address,
        nickname: createClientDto.nickname,
      },
    });
  }

  async findAll(): Promise<any[]> {
    return await this.prisma.clients.findMany();
  }

  async findOne(id: number): Promise<any> {
    return await this.prisma.clients.findUnique({
      where: { id },
    });
  }

  update(id: number, updateClientDto: UpdateClientDto) {
    return `This action updates a #${id} client`;
  }

  remove(id: number) {
    return `This action removes a #${id} client`;
  }
}
