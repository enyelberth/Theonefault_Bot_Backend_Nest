// bot-telegram.controller.ts
import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { MessageDto } from './dto/message-dto';
import { BotTelegramService } from './bot-telegram.service';
import { Public } from '../authA/auth.guard';

@ApiTags('bot-telegram')
@Controller('bot-telegram')
export class BotTelegramController {
  constructor(private readonly telegramService: BotTelegramService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Enviar mensaje a Telegram' })
  @ApiBody({ type: MessageDto, description: 'Datos del mensaje a enviar' })
  @ApiResponse({ status: 201, description: 'Mensaje enviado correctamente' })
  @ApiResponse({ status: 401, description: 'Token interno inválido' })
  @ApiResponse({ status: 400, description: 'Error en los datos de entrada' })
  sendMessage(
    @Body() messageDto: MessageDto,
    @Headers('x-telegram-internal-token') internalToken?: string,
  ) {
    const expectedToken = process.env.TELEGRAM_INTERNAL_TOKEN;
    if (expectedToken && internalToken !== expectedToken) {
      throw new UnauthorizedException('Token interno inválido');
    }

    return this.telegramService.sendMessage(messageDto.chatId, messageDto.message);
  }
}
