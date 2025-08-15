import { Injectable } from '@nestjs/common';
import { CreateCryptoPairDto } from './dto/create-crypto-pair.dto';
import { UpdateCryptoPairDto } from './dto/update-crypto-pair.dto';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class CryptoPairService {
  constructor(private prisma: PrismaClient) {
    this.prisma = new PrismaClient();
  }

  async create(createCryptoPairDto: CreateCryptoPairDto){
   // return await this.prisma.cryptoPair.create({
   //   data: createCryptoPairDto,
   // });
  }

  async findAll() {
   // return await this.prisma.cryptoPair.findMany();
  }

  findOne(id: number) {
    return `This action returns a #${id} cryptoPair`;
  }

  update(id: number, updateCryptoPairDto: UpdateCryptoPairDto) {
    return `This action updates a #${id} cryptoPair`;
  }

  remove(id: number) {
    return `This action removes a #${id} cryptoPair`;
  }
}
