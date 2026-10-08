import { ForbiddenException } from '@nestjs/common';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

describe('SessionController ownership', () => {
  const findByUser = jest.fn();
  const findAll = jest.fn();
  const service = { findAll, findByUser } as unknown as SessionService;
  const controller = new SessionController(service);

  beforeEach(() => jest.clearAllMocks());

  const reqFor = (userId: number) => ({ user: { sub: userId } }) as never;

  it('findByUser: bloquea pedir sesiones de otro usuario', async () => {
    expect(() => controller.findByUser(999, reqFor(10))).toThrow(
      ForbiddenException,
    );
    expect(findByUser).not.toHaveBeenCalled();
  });

  it('findByUser: permite pedir las propias sesiones', async () => {
    findByUser.mockReturnValue([{ id: 1 }]);

    const result = controller.findByUser(10, reqFor(10));

    expect(findByUser).toHaveBeenCalledWith(10);
    expect(result).toEqual([{ id: 1 }]);
  });
});
