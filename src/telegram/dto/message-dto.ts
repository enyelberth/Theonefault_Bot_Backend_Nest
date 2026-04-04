// dto/message-dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class MessageDto {
  @ApiProperty({ example: 'Hola mundo', description: 'Texto del mensaje a enviar' })
  @IsString()
  @MinLength(1)
  message: string;

  @ApiProperty({ example: 123456789, description: 'ID del chat de Telegram' })
  @IsInt()
  @Min(1)
  chatId: number;
}
