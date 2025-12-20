import { PartialType } from '@nestjs/swagger';
import { CreateGeminiDto } from './create-gemini.dto';

export class UpdateGeminiDto extends PartialType(CreateGeminiDto) {}
