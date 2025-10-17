import { Injectable } from '@nestjs/common';
import { CreateCryptoGuardDto } from './dto/create-crypto-guard.dto';
import { UpdateCryptoGuardDto } from './dto/update-crypto-guard.dto';

@Injectable()
export class CryptoGuardService {
  create(createCryptoGuardDto: CreateCryptoGuardDto) {
    return 'This action adds a new cryptoGuard';
  }

  findAll() {
    return `This action returns all cryptoGuard`;
  }

  findOne(id: number) {
    return `This action returns a #${id} cryptoGuard`;
  }

  update(id: number, updateCryptoGuardDto: UpdateCryptoGuardDto) {
    return `This action updates a #${id} cryptoGuard`;
  }

  remove(id: number) {
    return `This action removes a #${id} cryptoGuard`;
  }
}
