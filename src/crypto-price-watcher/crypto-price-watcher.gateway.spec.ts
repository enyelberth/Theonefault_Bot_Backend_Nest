import { Test, TestingModule } from '@nestjs/testing';
import { CryptoPriceWatcherGateway } from './crypto-price-watcher.gateway';

describe('CryptoPriceWatcherGateway', () => {
  let gateway: CryptoPriceWatcherGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CryptoPriceWatcherGateway],
    }).compile();

    gateway = module.get<CryptoPriceWatcherGateway>(CryptoPriceWatcherGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
