import { PartialType } from '@nestjs/swagger';
import { CreateCryptoPairDto } from './create-crypto-pair.dto';

export class UpdateCryptoPairDto extends PartialType(CreateCryptoPairDto) {}
