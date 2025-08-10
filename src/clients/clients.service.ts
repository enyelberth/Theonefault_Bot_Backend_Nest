import { Injectable, NotFoundException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createClientDto: CreateClientDto): Promise<any> {
    try {
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
    } catch (error) {
      throw new InternalServerErrorException('Error al crear el cliente: ' + error.message);
    }
  }

  async findAll(): Promise<any[]> {
    return await this.prisma.clients.findMany();
  }

  async findOne(id: number): Promise<any> {
    const client = await this.prisma.clients.findUnique({
      where: { id },
    });
    if (!client) {
      throw new NotFoundException(`Cliente con id ${id} no encontrado`);
    }
    return client;
  }

  async findByEmail(email: string): Promise<any> {
    const client = await this.prisma.clients.findUnique({
      where: { email },
    });
    if (!client) {
      throw new NotFoundException(`Cliente con email ${email} no encontrado`);
    }
    return client;
  }

  async findByPhone(phone: string): Promise<any> {
    const client = await this.prisma.clients.findFirst({
      where: { phone },
    });
    if (!client) {
      throw new NotFoundException(`Cliente con teléfono ${phone} no encontrado`);
    }
    return client;
  }

  async update(id: number, updateClientDto: UpdateClientDto): Promise<any> {
    try {
      const client = await this.prisma.clients.findUnique({ where: { id } });
      if (!client) {
        throw new NotFoundException(`Cliente con id ${id} no encontrado`);
      }
      return await this.prisma.clients.update({
        where: { id },
        data: updateClientDto,
      });
    } catch (error) {
      throw new InternalServerErrorException('Error al actualizar el cliente: ' + error.message);
    }
  }

  async remove(id: number): Promise<any> {
    try {
      const client = await this.prisma.clients.findUnique({ where: { id } });
      if (!client) {
        throw new NotFoundException(`Cliente con id ${id} no encontrado`);
      }
      return await this.prisma.clients.delete({
        where: { id },
      });
    } catch (error) {
      throw new InternalServerErrorException('Error al eliminar el cliente: ' + error.message);
    }
  }
}
