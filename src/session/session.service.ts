import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Session } from '@prisma/client';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(createSessionDto: CreateSessionDto): Promise<Session> {
    this.logger.log('Creating session');
    return this.prisma.session.create({ data: createSessionDto });
  }

  async findAll(): Promise<Session[]> {
    return this.prisma.session.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: number): Promise<Session> {
    const session = await this.prisma.session.findUnique({ where: { id } });
    if (!session) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }

    return session;
  }

  async findByUserId(userId: number): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: number, updateSessionDto: UpdateSessionDto): Promise<Session> {
    await this.findOne(id);
    return this.prisma.session.update({
      where: { id },
      data: updateSessionDto,
    });
  }

  async remove(id: number): Promise<Session> {
    await this.findOne(id);
    return this.prisma.session.delete({ where: { id } });
  }
}