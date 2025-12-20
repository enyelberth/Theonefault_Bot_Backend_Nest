import { Test, TestingModule } from '@nestjs/testing';
import { TelegramSofiaService } from './telegram-sofia.service';

describe('TelegramSofiaService', () => {
  let service: TelegramSofiaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TelegramSofiaService],
    }).compile();

    service = module.get<TelegramSofiaService>(TelegramSofiaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
