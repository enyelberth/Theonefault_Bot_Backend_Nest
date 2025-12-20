import { Injectable } from '@nestjs/common';
import { GeminiService } from '../geminis/geminis.service'; // Importa tu servicio de IA

@Injectable()
export class TelegramSofiaService {
  constructor(private readonly geminiService: GeminiService) {}

  async chatWithSofia(userId: number, message: string) {
    // Aquí usamos la lógica de memoria que implementamos antes
    // Sofía responderá como "bebé, amor, etc." por el SystemInstruction
    return await this.geminiService.chat( userId,message);
  }
}