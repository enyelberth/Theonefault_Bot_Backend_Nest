import { PartialType } from '@nestjs/swagger';
import { CreateAccountBalanceDto } from './create-account-balance.dto';

export class UpdateAccountBalanceDto extends PartialType(
  CreateAccountBalanceDto,
) {}
