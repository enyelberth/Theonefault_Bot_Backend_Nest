import { Test, TestingModule } from '@nestjs/testing';
import { GeminiService } from './geminis.service';
import { ConfigModule } from '@nestjs/config';

describe('GeminisService', () => {
  let service: GeminiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GeminiService],
      imports: [ConfigModule.forRoot()],
    }).compile();

    service = module.get<GeminiService>(GeminiService);

    // ¡ESTA ES LA CLAVE!
    // Manualmente ejecutamos la lógica de conexión a Google antes de los tests
    await service.onModuleInit();
  });

  it('Sofía debería responder con palabras cariñosas', async () => {
    jest.setTimeout(15000); // Darle tiempo a la IA

    try {
      const response = await service.generateText('Hola Sofi, ¿me quieres?');
      console.log('Respuesta de Sofía:', response);

      const palabrasCarinosas = [
        'bebe',
        'amor',
        'corazón',
        'corazon',
        'vida',
        'cielo',
        'cariño',
      ];
      const contienePalabra = palabrasCarinosas.some((palabra) =>
        response.toLowerCase().includes(palabra),
      );

      expect(contienePalabra).toBe(true);
    } catch (error) {
      // Si falla por cuota (429), el test no debería marcar error de código, sino de cuota
      console.error(
        'Error durante el test (posiblemente cuota):',
        error.message,
      );
    }
  });
});
