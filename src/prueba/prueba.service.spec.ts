import { Test, TestingModule } from '@nestjs/testing';
import { PruebaService } from './prueba.service';

describe('PruebaService', () => {
  let service: PruebaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PruebaService,
          // Si el constructor pide parámetros, usamos useValue o useFactory
          useValue: new PruebaService('Enye', 'Rodr', 20),
        },
      ],
    }).compile();

    service = module.get<PruebaService>(PruebaService);
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debería retornar el saludo correctamente (Greed)', () => {
    const res = service.Greed();

    console.log('Resultado del saludo:', res);

    // Verificamos que el resultado contenga el nombre que pasamos
    expect(res).toContain('Enye');
    expect(typeof res).toBe('string');
  });
});
