// dto/message-dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class MessageDto {
  @ApiProperty({ example: 'Hola mundo', description: 'Texto del mensaje a enviar' })
  message: string;

  @ApiProperty({ example: 123456789, description: 'ID del chat de Telegram' })
  chatId: number;
}
