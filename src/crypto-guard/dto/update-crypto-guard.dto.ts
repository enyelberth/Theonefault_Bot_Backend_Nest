import { PartialType } from '@nestjs/mapped-types';
import { CreateCryptoGuardDto } from './create-crypto-guard.dto';

export class UpdateCryptoGuardDto extends PartialType(CreateCryptoGuardDto) {
  id: number;
}
