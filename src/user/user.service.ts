import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'prisma/prisma.service';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  constructor(private readonly prisma: PrismaService) { }

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  private verifyPassword(password: string, stored: string): boolean {
    const [salt, key] = stored.split(':');
    if (!salt || !key) {
      return false;
    }

    const candidate = scryptSync(password, salt, 64);
    const storedKey = Buffer.from(key, 'hex');
    if (candidate.length !== storedKey.length) {
      return false;
    }

    return timingSafeEqual(candidate, storedKey);
  }

  private sanitizeUser<T extends { password: string }>(user: T): Omit<T, 'password'> {
    const { password, ...safeUser } = user;
    return safeUser;
  }

  async create(createUserDto: CreateUserDto) {
    try {
      const payload = {
        ...createUserDto,
        password: this.hashPassword(createUserDto.password),
      };
      const user = await this.prisma.user.create({ data: payload });
      return this.sanitizeUser(user);
    } catch (error) {
      this.logger.error('Error creating user', error);
      throw new BadRequestException('Error creating user');
    }
  }

  async findAll() {
    const users = await this.prisma.user.findMany();
    return users.map((user) => this.sanitizeUser(user));
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return this.sanitizeUser(user);
  }
  async findByEmail(email: string) {
    return await this.prisma.user.findUnique({ where: { email } });
  }


  async findByUsername(username: string) {
    return await this.prisma.user.findFirst({ where: { username } });
  }


  async update(id: number, updateUserDto: UpdateUserDto) {
    try {
      await this.findOne(id); // Verifica que exista antes de actualizar
      const data = {
        ...updateUserDto,
        ...(updateUserDto.password ? { password: this.hashPassword(updateUserDto.password) } : {}),
      };
      const user = await this.prisma.user.update({ where: { id }, data });
      return this.sanitizeUser(user);
    } catch (error) {
      this.logger.error(`Error updating user with id ${id}`, error);
      throw new BadRequestException('Error updating user');
    }
  }

  async remove(id: number) {
    try {
      await this.findOne(id); // Verifica que exista antes de eliminar
      const user = await this.prisma.user.delete({ where: { id } });
      return this.sanitizeUser(user);
    } catch (error) {
      this.logger.error(`Error deleting user with id ${id}`, error);
      throw new BadRequestException('Error deleting user');
    }
  }

  // Método para verificar si un usuario o email ya existe (por ejemplo antes de registrar)
  async existsByEmail(email: string): Promise<boolean> {
    const user = await this.findByEmail(email);
    return Boolean(user);
  }

  async existsByUsername(username: string): Promise<boolean> {
    const user = await this.findByUsername(username);
    return Boolean(user);
  }

  // Método básico para login (verifica email y password)
  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new BadRequestException('Invalid credentials');
    }
    if (!this.verifyPassword(password, user.password)) {
      throw new BadRequestException('Invalid credentials');
    }
    return this.sanitizeUser(user);
  }
}
