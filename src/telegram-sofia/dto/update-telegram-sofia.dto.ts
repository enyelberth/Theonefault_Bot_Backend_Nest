import { PartialType } from '@nestjs/mapped-types';
import { CreateTelegramSofiaDto } from './create-telegram-sofia.dto';

export class UpdateTelegramSofiaDto extends PartialType(
  CreateTelegramSofiaDto,
) {
  id: number;
}
