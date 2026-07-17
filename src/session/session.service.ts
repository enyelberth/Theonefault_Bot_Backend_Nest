import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaClient) {}

  findAll() {
    return this.prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findByUser(userId: number) {
    return this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
