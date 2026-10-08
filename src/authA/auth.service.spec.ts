import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const jwtServiceMock = {
    signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
    verifyAsync: jest.fn(),
  };

  let prismaMock: { user: { findFirst: jest.Mock; findUnique: jest.Mock } };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    service = new AuthService(prismaMock as any, jwtServiceMock as any);
  });

  describe('signIn', () => {
    it('autentica con password correcto (hasheado) y devuelve access_token', async () => {
      const hashed = await bcrypt.hash('correct-password', 10);
      prismaMock.user.findFirst.mockResolvedValue({
        id: 1,
        email: 'a@b.com',
        password: hashed,
      });

      const result = await service.signIn('a@b.com', 'correct-password');

      expect(result).toEqual({ access_token: 'signed.jwt.token' });
      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith({
        sub: 1,
        email: 'a@b.com',
      });
    });

    it('rechaza password incorrecto aunque el usuario exista', async () => {
      const hashed = await bcrypt.hash('correct-password', 10);
      prismaMock.user.findFirst.mockResolvedValue({
        id: 1,
        email: 'a@b.com',
        password: hashed,
      });

      await expect(service.signIn('a@b.com', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rechaza cuando el usuario no existe sin filtrar si fue por email o password', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(service.signIn('ghost@b.com', 'whatever')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('nunca compara el password en texto plano directamente', async () => {
      // Si el hash fuese comparado con !==, un password distinto al hash "pasaría" por error de lógica invertida.
      const hashed = await bcrypt.hash('correct-password', 10);
      prismaMock.user.findFirst.mockResolvedValue({
        id: 1,
        email: 'a@b.com',
        password: hashed,
      });

      await expect(service.signIn('a@b.com', hashed)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refreshToken', () => {
    const originalEnv = process.env.JWT_REFRESH_SECRET;

    afterEach(() => {
      process.env.JWT_REFRESH_SECRET = originalEnv;
    });

    it('lanza UnauthorizedException si JWT_REFRESH_SECRET no está configurado', async () => {
      delete process.env.JWT_REFRESH_SECRET;

      await expect(service.refreshToken('some.refresh.token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('emite un nuevo access_token cuando el refresh token es válido', async () => {
      process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
      jwtServiceMock.verifyAsync.mockResolvedValue({ sub: 1 });
      prismaMock.user.findUnique.mockResolvedValue({ id: 1, email: 'a@b.com' });

      const result = await service.refreshToken('valid.refresh.token');

      expect(result).toEqual({ access_token: 'signed.jwt.token' });
    });
  });
});
