import { PartialType } from '@nestjs/swagger';
import { CreateTradingExecutionDto } from './create-trading-execution.dto';

export class UpdateTradingExecutionDto extends PartialType(CreateTradingExecutionDto) {}