jest.mock('../bot/bot.service', () => ({ BotService: jest.fn() }));
jest.mock('../bot/strategy.factory', () => ({}));
jest.mock('../account/account.service', () => ({ AccountService: jest.fn() }));
jest.mock('../binance/binance.service', () => ({ BinanceService: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { CryptoGuardGateway } from './crypto-guard.gateway';
import { AccountService } from '../account/account.service';
import { BinanceService } from '../binance/binance.service';
import { BotService } from '../bot/bot.service';

describe('CryptoGuardGateway', () => {
  let gateway: CryptoGuardGateway;
  let jwtService: { verifyAsync: jest.Mock };

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  const makeClient = (token?: string) => {
    const disconnect = jest.fn();
    return {
      handshake: {
        auth: token ? { token } : {},
        headers: {},
      },
      data: {} as any,
      disconnect,
    } as any;
  };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoGuardGateway,
        {
          provide: AccountService,
          useValue: { findCryptosByUserId: jest.fn() },
        },
        { provide: BinanceService, useValue: {} },
        { provide: BotService, useValue: { getActiveBots: jest.fn() } },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    gateway = module.get<CryptoGuardGateway>(CryptoGuardGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('desconecta el socket si no envía token', async () => {
    const client = makeClient();
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('desconecta el socket si el token es inválido', async () => {
    jwtService.verifyAsync.mockRejectedValueOnce(new Error('invalid'));
    const client = makeClient('bad-token');
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('acepta la conexión y guarda el payload si el token es válido', async () => {
    jwtService.verifyAsync.mockResolvedValueOnce({ sub: 1, email: 'a@b.com' });
    const client = makeClient('good-token');
    await gateway.handleConnection(client);
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.data.user).toEqual({ sub: 1, email: 'a@b.com' });
  });
});
