import { Test, TestingModule } from '@nestjs/testing';
import { GeminisController } from './geminis.controller';
import { GeminiService } from './geminis.service';
import { ConfigModule } from '@nestjs/config';

describe('GeminisController', () => {
  let controller: GeminisController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GeminisController],
      providers: [GeminiService],
        imports: [ConfigModule.forRoot()],
      
    }).compile();

    controller = module.get<GeminisController>(GeminisController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
