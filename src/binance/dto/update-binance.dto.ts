import { PartialType } from '@nestjs/mapped-types';
import { CreateBinanceDto } from './create-binance.dto';

export class UpdateBinanceDto extends PartialType(CreateBinanceDto) {
  id: number;
}
