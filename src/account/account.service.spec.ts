import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountService } from './account.service';

describe('AccountService ownership', () => {
  const findUnique = jest.fn();
  const findMany = jest.fn();
  const update = jest.fn();
  const remove = jest.fn();
  const balanceFindUnique = jest.fn();
  const balanceUpdate = jest.fn();
  const balanceCreate = jest.fn();

  const prisma = {
    account: { findUnique, findMany, update, delete: remove },
    accountBalance: {
      findUnique: balanceFindUnique,
      update: balanceUpdate,
      create: balanceCreate,
    },
  };

  const service = new AccountService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  const ownerAccount = { id: 1, userId: 10, email: 'owner@test.com' };

  it('findOneWithBalance: bloquea a un usuario que no es dueño de la cuenta', async () => {
    findUnique.mockResolvedValue({
      ...ownerAccount,
      accountBalances: [],
      bankAccountType: null,
    });

    await expect(service.findOneWithBalance(1, 999)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('findOneWithBalance: permite al dueño real de la cuenta', async () => {
    findUnique.mockResolvedValue({
      ...ownerAccount,
      accountBalances: [],
      bankAccountType: null,
    });

    await expect(service.findOneWithBalance(1, 10)).resolves.toMatchObject({
      id: 1,
    });
  });

  it('updateBalanceById: bloquea mutar el saldo de una cuenta ajena', async () => {
    balanceFindUnique.mockResolvedValue({
      id: 5,
      accountId: 1,
      account: ownerAccount,
    });

    await expect(service.updateBalanceById(5, 100, 999)).rejects.toThrow(
      ForbiddenException,
    );
    expect(balanceUpdate).not.toHaveBeenCalled();
  });

  it('updateBalanceById: permite al dueño actualizar su propio saldo', async () => {
    balanceFindUnique.mockResolvedValue({
      id: 5,
      accountId: 1,
      account: ownerAccount,
    });
    balanceUpdate.mockResolvedValue({ id: 5, balance: 100 });

    await expect(service.updateBalanceById(5, 100, 10)).resolves.toMatchObject({
      id: 5,
    });
    expect(balanceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5 }, data: { balance: 100 } }),
    );
  });

  it('updateBalanceById: 404 cuando el saldo no existe, sin filtrar si es ajeno', async () => {
    balanceFindUnique.mockResolvedValue(null);

    await expect(service.updateBalanceById(999, 1, 10)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('findByUserIdWithBalances: bloquea pedir cuentas de otro userId', async () => {
    await expect(service.findByUserIdWithBalances(10, 999)).rejects.toThrow(
      ForbiddenException,
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it('update: ignora un userId distinto enviado en el body (no permite reasignar la cuenta)', async () => {
    findUnique.mockResolvedValue(ownerAccount);
    update.mockResolvedValue({ ...ownerAccount, email: 'new@test.com' });

    await service.update(
      1,
      { userId: 999, email: 'new@test.com' } as never,
      10,
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { email: 'new@test.com' },
    });
  });

  it('update: bloquea a quien no es dueño de la cuenta', async () => {
    findUnique.mockResolvedValue(ownerAccount);

    await expect(
      service.update(1, { email: 'x@test.com' } as never, 999),
    ).rejects.toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('remove: bloquea borrar la cuenta de otro usuario', async () => {
    findUnique.mockResolvedValue(ownerAccount);

    await expect(service.remove(1, 999)).rejects.toThrow(ForbiddenException);
    expect(remove).not.toHaveBeenCalled();
  });

  it('findByEmail: no revela que la cuenta existe si pertenece a otro usuario (evita enumeración)', async () => {
    findUnique.mockResolvedValue(ownerAccount);

    await expect(service.findByEmail('owner@test.com', 999)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('createBalance: bloquea crear saldo en cuenta ajena', async () => {
    findUnique.mockResolvedValue(ownerAccount);

    await expect(service.createBalance(1, 'BTC', 0, 999)).rejects.toThrow(
      ForbiddenException,
    );
    expect(balanceCreate).not.toHaveBeenCalled();
  });

  it('updateCryptoBalance: bloquea mutar saldo de cuenta ajena', async () => {
    findUnique.mockResolvedValue(ownerAccount);

    await expect(service.updateCryptoBalance(1, 'BTC', 5, 999)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
