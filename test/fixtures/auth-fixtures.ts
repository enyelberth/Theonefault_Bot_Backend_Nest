import { PrismaClient } from '@prisma/client';
import { DeterministicFactory } from '../factories/deterministic.factory';

export async function createAuthFixture(prisma: PrismaClient, seed = 'auth') {
  const factory = new DeterministicFactory(seed);
  return prisma.user.create({
    data: {
      email: factory.nextEmail('auth-user'),
      username: factory.nextId('auth-user'),
      password: 'fixture-password-not-for-prod',
      role: 'ADMIN',
    } as any,
  });
}
