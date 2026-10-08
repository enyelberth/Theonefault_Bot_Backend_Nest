import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProfileService } from './profile.service';

describe('ProfileService ownership', () => {
  const profileFindUnique = jest.fn();
  const userFindFirst = jest.fn();
  const profileUpdate = jest.fn();
  const profileDelete = jest.fn();

  const prisma = {
    profile: {
      findUnique: profileFindUnique,
      update: profileUpdate,
      delete: profileDelete,
      findMany: jest.fn(),
    },
    user: { findFirst: userFindFirst },
  };

  const service = new ProfileService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('findOneOwned: bloquea leer el perfil de otro usuario', async () => {
    profileFindUnique.mockResolvedValue({ id: 1, firstName: 'A' });
    userFindFirst.mockResolvedValue(null); // ningún User con profileId=1 tiene id=999

    await expect(service.findOneOwned(1, 999)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('findOneOwned: permite leer el propio perfil', async () => {
    profileFindUnique.mockResolvedValue({ id: 1, firstName: 'A' });
    userFindFirst.mockResolvedValue({ id: 10, profileId: 1 });

    await expect(service.findOneOwned(1, 10)).resolves.toMatchObject({ id: 1 });
  });

  it('findOneOwned: 404 si el perfil no existe, antes de chequear ownership', async () => {
    profileFindUnique.mockResolvedValue(null);

    await expect(service.findOneOwned(999, 10)).rejects.toThrow(
      NotFoundException,
    );
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it('update: bloquea editar el perfil de otro usuario', async () => {
    profileFindUnique.mockResolvedValue({ id: 1 });
    userFindFirst.mockResolvedValue(null);

    await expect(
      service.update(1, { firstName: 'X' } as never, 999),
    ).rejects.toThrow(ForbiddenException);
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it('remove: bloquea borrar el perfil de otro usuario', async () => {
    profileFindUnique.mockResolvedValue({ id: 1 });
    userFindFirst.mockResolvedValue(null);

    await expect(service.remove(1, 999)).rejects.toThrow(ForbiddenException);
    expect(profileDelete).not.toHaveBeenCalled();
  });
});
