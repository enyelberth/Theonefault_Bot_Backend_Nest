import { Test, TestingModule } from '@nestjs/testing';
import { TelegramSofiaGateway } from './telegram-sofia.gateway';
import { TelegramSofiaService } from './telegram-sofia.service';
import { GeminiService } from '../geminis/geminis.service';

describe('TelegramSofiaGateway', () => {
  let gateway: TelegramSofiaGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramSofiaGateway,
        TelegramSofiaService,
        {
          provide: GeminiService,
          useValue: { chat: jest.fn() },
        },
      ],
    }).compile();

    gateway = module.get<TelegramSofiaGateway>(TelegramSofiaGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
