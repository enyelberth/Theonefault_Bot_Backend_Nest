import { ForbiddenException } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController ownership checks', () => {
  let userServiceMock: { update: jest.Mock; remove: jest.Mock };
  let controller: UserController;

  beforeEach(() => {
    userServiceMock = { update: jest.fn(), remove: jest.fn() };
    controller = new UserController(userServiceMock as unknown as UserService);
  });

  const reqAs = (sub: number) => ({ user: { sub } }) as any;

  describe('update', () => {
    it('rechaza cuando el usuario autenticado intenta modificar a otro usuario', async () => {
      await expect(
        controller.update(2, { username: 'hacked' } as any, reqAs(1)),
      ).rejects.toThrow(ForbiddenException);
      expect(userServiceMock.update).not.toHaveBeenCalled();
    });

    it('permite cuando el usuario autenticado modifica su propia cuenta', async () => {
      userServiceMock.update.mockResolvedValue({ id: 1 });
      await controller.update(1, { username: 'me' } as any, reqAs(1));
      expect(userServiceMock.update).toHaveBeenCalledWith(1, {
        username: 'me',
      });
    });
  });

  describe('remove', () => {
    it('rechaza cuando el usuario autenticado intenta borrar a otro usuario', async () => {
      await expect(controller.remove(2, reqAs(1))).rejects.toThrow(
        ForbiddenException,
      );
      expect(userServiceMock.remove).not.toHaveBeenCalled();
    });

    it('permite cuando el usuario autenticado borra su propia cuenta', async () => {
      userServiceMock.remove.mockResolvedValue({ id: 1 });
      await controller.remove(1, reqAs(1));
      expect(userServiceMock.remove).toHaveBeenCalledWith(1);
    });
  });
});
