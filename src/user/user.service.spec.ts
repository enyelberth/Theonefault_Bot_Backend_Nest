import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UserService } from './user.service';

describe('UserService', () => {
  let prismaMock: {
    user: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let service: UserService;

  beforeEach(() => {
    prismaMock = {
      user: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new UserService(prismaMock as any);
  });

  describe('create', () => {
    it('hashea el password antes de persistirlo, nunca guarda el texto plano', async () => {
      prismaMock.user.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 1, email: data.email, username: data.username }),
      );

      await service.create({
        email: 'a@b.com',
        password: 'plain-password',
        username: 'a',
      } as any);

      const persistedData = prismaMock.user.create.mock.calls[0][0].data;
      expect(persistedData.password).not.toBe('plain-password');
      expect(
        await bcrypt.compare('plain-password', persistedData.password),
      ).toBe(true);
    });

    it('nunca selecciona el campo password en la respuesta', async () => {
      prismaMock.user.create.mockResolvedValue({
        id: 1,
        email: 'a@b.com',
        username: 'a',
      });

      await service.create({
        email: 'a@b.com',
        password: 'plain-password',
        username: 'a',
      } as any);

      const selectArg = prismaMock.user.create.mock.calls[0][0].select;
      expect(selectArg.password).toBeUndefined();
    });
  });

  describe('findAll / findOne', () => {
    it('findAll nunca incluye password en el select', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      await service.findAll();
      const selectArg = prismaMock.user.findMany.mock.calls[0][0].select;
      expect(selectArg.password).toBeUndefined();
    });

    it('findOne nunca incluye password en el select', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 1 });
      await service.findOne(1);
      const selectArg = prismaMock.user.findUnique.mock.calls[0][0].select;
      expect(selectArg.password).toBeUndefined();
    });
  });

  describe('validateUser', () => {
    it('autentica con password correcto y no devuelve el hash en el resultado', async () => {
      const hashed = await bcrypt.hash('correct-password', 10);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'a@b.com',
        password: hashed,
      });

      const result = await service.validateUser('a@b.com', 'correct-password');

      expect(result.password).toBeUndefined();
      expect(result.id).toBe(1);
    });

    it('rechaza password incorrecto', async () => {
      const hashed = await bcrypt.hash('correct-password', 10);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'a@b.com',
        password: hashed,
      });

      await expect(
        service.validateUser('a@b.com', 'wrong-password'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza cuando el usuario no existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.validateUser('ghost@b.com', 'whatever'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('hashea el nuevo password si viene en el DTO', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.user.update.mockResolvedValue({ id: 1 });

      await service.update(1, { password: 'new-plain-password' } as any);

      const persistedData = prismaMock.user.update.mock.calls[0][0].data;
      expect(persistedData.password).not.toBe('new-plain-password');
      expect(
        await bcrypt.compare('new-plain-password', persistedData.password),
      ).toBe(true);
    });
  });
});
