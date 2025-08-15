import { Injectable } from '@nestjs/common';
import { CreateCryptoPriceDto } from './dto/create-crypto-price.dto';
import { UpdateCryptoPriceDto } from './dto/update-crypto-price.dto';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class CryptoPriceService {
  constructor(private readonly prisma: PrismaClient) {
  }
  create(createCryptoPriceDto: CreateCryptoPriceDto) {
    /*
    console.log("hola");
    console.log(createCryptoPriceDto);
    return this.prisma.cryptoPrice.create({
      data: createCryptoPriceDto,
    });
    */
  }
   async createPrueba(price: number, pairId: number){
  /*
    console.log("hola");
    return this.prisma.cryptoPrice.create({
      data: {
        price: price,
        pairId: pairId,
      },
    });*/
  }
  

  findAll() {
 //   return this.prisma.cryptoPrice.findMany();
  }

  findOne(id: number) {
   /*
    return this.prisma.cryptoPrice.findUnique({
      where: { id },
    });
    */
  }

  update(id: number, updateCryptoPriceDto: UpdateCryptoPriceDto) {
    /*
    return this.prisma.cryptoPrice.update({
      where: { id },
      data: updateCryptoPriceDto,
    });
    */
  }

  remove(id: number) {
    /*
    return this.prisma.cryptoPrice.delete({
      where: { id },
    });
    */
  }
    
}
